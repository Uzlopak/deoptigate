'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const test = require('tape')

const { processLogContent } = require('../deoptigate')

const repoRoot = path.join(__dirname, '..')
const casesDir = path.join(repoRoot, 'examples/cases')
const catalogPath = path.join(repoRoot, 'assets/deoptimization.md')
const nativeSyntax = '--allow-natives-syntax'
const lazyReasons = new Set([
  'MapDeprecated',
  'PrototypeChange',
  'PropertyCellChange',
  'FieldTypeConstChange',
  'FieldTypeChange',
  'FieldRepresentationChange',
  'InitialMapChange',
  'AllocationSiteTransitionChange',
  'ContextCellChange',
  'EmptyContextExtensionChange',
  'WeakObjects',
  'Debugger',
  'Testing',
  'ExceptionCaught',
  'EagerDeopt',
  'FrameValueMaterialized'
])

function readCatalogReasons() {
  const contents = fs.readFileSync(catalogPath, 'utf8').split('## Reading the examples')[0]
  const reasons = []
  for (const line of contents.split('\n')) {
    const match = /^\| `([^`]+)` \| ([^|]+) \|/.exec(line)
    if (match) reasons.push({ name: match[1], message: match[2].trim().replace(/^`(.*)`$/, '$1') })
  }
  return reasons
}

function casePathFor(reason) {
  const filename = reason
    .replace(/[A-Z]/g, (letter, index) => `${index ? '-' : ''}${letter.toLowerCase()}`)
    .replace('java-script', 'javascript')
    .replace('na-n', 'nan')
    .replace('o-s-r-', 'osr-')
  return path.join(casesDir, `${filename}.js`)
}

function liveMessagesFor(reason) {
  // V8 versions differ on whether the message includes the immutable-buffer case.
  if (reason.name === 'ArrayBufferWasDetached') {
    return new Set(['array buffer was detached', 'array buffer was detached or immutable'])
  }
  return new Set([reason.message])
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'ignore' })
    child.once('error', reject)
    child.once('close', code => resolve(code))
  })
}

function runtimeRequiresPrepareBeforeOptimize() {
  return spawnSync(
    process.execPath,
    [nativeSyntax, '-e', 'function f() {}; %OptimizeFunctionOnNextCall(f); f()'],
    { stdio: 'ignore' }
  ).status !== 0
}

function prepareOptimizationTargets(source) {
  return source.replace(/(%+)(OptimizeFunctionOnNextCall|OptimizeMaglevOnNextCall|OptimizeOsr)\s*\(\s*([\w$]+)\s*\)/g,
    (...matches) => {
      const [call, , , target] = matches
      if (source.includes(`%PrepareFunctionForOptimization(${target})`)) return call
      return `%PrepareFunctionForOptimization(${target}); ${call}`
    })
}

const requiredFlagsByReason = {
  ContextCellChange: ['--script-context-cells'],
  LoopSpeculationFailed: ['--turboshaft-loop-optimization'],
  NotAdditiveSafeInteger: [
    '--turbolev',
    '--additive-safe-int-feedback',
    '--turbolev-additive-safe-int-feedback'
  ],
  StringTooLarge: ['--max-old-space-size=96']
}

const specialFlagsByReason = {
  ContextCellChange: ['--script-context-cells', '--maglev', '--maglev-function-context-specialization'],
  LoopSpeculationFailed: ['--turbofan', '--turboshaft-loop-optimization', '--no-turbolev'],
  NotAdditiveSafeInteger: [
    '--turbolev',
    '--additive-safe-int-feedback',
    '--turbolev-additive-safe-int-feedback'
  ],
  StringTooLarge: ['--max-old-space-size=96']
}

function missingV8Flags(flags) {
  return flags.filter(flag => spawnSync(
    process.execPath,
    [flag, '--version'],
    { stdio: 'ignore' }
  ).status !== 0)
}

test('live JavaScript cases produce the named deopts in V8 logs deoptigate can parse', async (t) => {
  const reasons = readCatalogReasons()
  const needsPrepare = runtimeRequiresPrepareBeforeOptimize()
  const missingLogFlags = missingV8Flags(['--log-deopt', '--no-logfile-per-isolate'])
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deoptigate-live-cases-'))

  t.equal(reasons.length, 84, 'test catalog matches V8 73f16b50 (68 regular, 16 lazy)')

  for (const reason of reasons) {
    if (missingLogFlags.length > 0) {
      t.skip(`${reason.name}: current Node/V8 cannot produce the required log (${missingLogFlags.join(', ')})`)
      continue
    }

    const sourcePath = casePathFor(reason.name)
    if (!fs.existsSync(sourcePath)) {
      t.skip(`${reason.name}: no verified live JavaScript case yet`)
      continue
    }

    const requiredFlags = [
      ...(requiredFlagsByReason[reason.name] || []),
      ...(specialFlagsByReason[reason.name] || [])
    ]
    const missingFlags = missingV8Flags(requiredFlags)
    if (missingFlags.length > 0) {
      t.skip(`${reason.name}: current Node/V8 does not recognize ${missingFlags.join(', ')}`)
      continue
    }
    const logPath = path.join(tempDir, `${reason.name}.v8.log`)
    let extraFlags = []
    if (
      reason.name === 'PropertyCellChange' ||
      reason.name === 'ValueMismatch' ||
      reason.name === 'Unknown' ||
      reason.name === 'DeoptimizeNow'
    ) {
      // --always-turbofan was removed in newer V8 builds. Disabling Maglev
      // leaves TurboFan as the optimizing tier on runtimes that support it.
      extraFlags = ['--no-maglev']
    }
    if (
      reason.name === 'WrongConstructor' ||
      reason.name === 'UnexpectedContextExtension' ||
      reason.name === 'NotAJavaScriptObjectOrNullOrUndefined' ||
      reason.name === 'NotANumberOrBoolean' ||
      reason.name === 'NotAStringOrStringWrapper' ||
      reason.name === 'WrongMapDynamic' ||
      reason.name === 'StoreToConstant' ||
      reason.name === 'ExceptionCaught' ||
      reason.name === 'NotUint32'
    ) {
      extraFlags = ['--no-turbofan']
    }
    if (reason.name === 'WeakObjects') {
      extraFlags = ['--expose-gc', '--no-maglev']
    }
    if (reason.name === 'EmptyContextExtensionChange') {
      extraFlags = ['--maglev', '--optimize-on-next-call-optimizes-to-maglev']
    }
    if (reason.name === 'ContextCellChange') {
      extraFlags = specialFlagsByReason[reason.name]
    }
    if (reason.name === 'LoopSpeculationFailed' || reason.name === 'NotAdditiveSafeInteger') {
      extraFlags = specialFlagsByReason[reason.name]
    }
    if (reason.name === 'PrepareForOnStackReplacement') {
      extraFlags = ['--maglev', '--use-osr', '--always-osr-from-maglev']
    }
    if (
      [
        'InsufficientTypeFeedbackForArrayLiteral',
        'InsufficientTypeFeedbackForGenericGlobalAccess',
        'InsufficientTypeFeedbackForInstanceOf',
        'InsufficientTypeFeedbackForObjectLiteral',
        'InsufficientTypeFeedbackForTypeOf'
      ].includes(reason.name)
    ) {
      extraFlags = ['--no-turbofan']
    }
    const noConcurrentRecompilation = reason.name === 'PrepareForOnStackReplacement'
      ? []
      : ['--no-concurrent-recompilation']
    const caseSource = fs.readFileSync(sourcePath, 'utf8')
    const executableSource = needsPrepare ? prepareOptimizationTargets(caseSource) : caseSource
    let caseArgs
    if (reason.name === 'ContextCellChange') {
      caseArgs = ['-e', executableSource]
    } else if (needsPrepare && executableSource !== caseSource) {
      const preparedCasePath = path.join(tempDir, `${reason.name}.prepared.js`)
      fs.writeFileSync(preparedCasePath, executableSource)
      caseArgs = [preparedCasePath]
    } else {
      caseArgs = [sourcePath]
    }
    const code = await runNode([
      nativeSyntax,
      ...noConcurrentRecompilation,
      '--log-deopt',
      `--logfile=${logPath}`,
      '--no-logfile-per-isolate',
      ...extraFlags,
      ...caseArgs
    ])

    const rawLog = fs.existsSync(logPath)
      ? fs.readFileSync(logPath, 'utf8').split(/\r?\n/)
      : []
    const processed = await processLogContent(rawLog, repoRoot)
    const updates = processed.toObject().deopts.reduce((all, deopt) => all.concat(deopt.updates), [])
    const expectedMessages = liveMessagesFor(reason)
    const matching = updates.filter(update => expectedMessages.has(update.deoptReason))
    t.equal(code, 0, `${reason.name}: case exits cleanly`)
    t.ok(
      matching.length > 0,
      `${reason.name}: expected one of ${JSON.stringify([...expectedMessages])}; exit ${code}; parsed ${JSON.stringify(updates.map(update => update.deoptReason))}`
    )
    const expectedSeverity = lazyReasons.has(reason.name) || reason.name === 'Unknown' ? 2 : 3
    t.ok(
      matching.every(update => update.severity === expectedSeverity),
      `${reason.name}: matched deoptigate severity ${expectedSeverity}`
    )
  }

  for (const filename of fs.readdirSync(tempDir)) fs.unlinkSync(path.join(tempDir, filename))
  fs.rmdirSync(tempDir)
  t.end()
})
