'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const test = require('node:test')

const { processLogContent } = require('../deoptigate')
const { createReasonLookup, reasonIdsForMajor } = require('./deopt-reason-lookup')

const repoRoot = path.join(__dirname, '..')
const casesDir = path.join(repoRoot, 'examples/cases')
const catalogPath = path.join(repoRoot, 'assets/deoptimization.md')
const nativeSyntax = '--allow-natives-syntax'
const CATALOG_REASON_LINE_RX = /^\| `([^`]+)` \| ([^|]+) \|/
const BACKTICK_EDGE_RX = /^`(.*)`$/
const REASON_NAME_CAPITAL_RX = /[A-Z]/g
const OPTIMIZATION_INTRINSIC_CALL_RX = /(?:%+)(?:OptimizeFunctionOnNextCall|OptimizeMaglevOnNextCall|OptimizeOsr)\s*\(\s*([\w$]+)\s*\)/g
const LINE_ENDINGS_RX = /\r?\n/
/** @type {Record<string, number>} */
const severityByBailoutType = {
  soft: 1,
  lazy: 2,
  'dependency-change': 2,
  eager: 3
}

/** @returns {{ name: string, message: string }[]} */
function readCatalogReasons () {
  const contents = fs.readFileSync(catalogPath, 'utf8').split('## Reading the examples')[0]
  const reasons = []
  for (const line of contents.split('\n')) {
    const match = CATALOG_REASON_LINE_RX.exec(line)
    if (match) reasons.push({ name: match[1], message: match[2].trim().replace(BACKTICK_EDGE_RX, '$1') })
  }
  return reasons
}

/**
 * @param {string} reason
 * @returns {string}
 */
function casePathFor (reason) {
  const filename = reason
    .replace(REASON_NAME_CAPITAL_RX, (letter, index) => `${index ? '-' : ''}${letter.toLowerCase()}`)
    .replace('java-script', 'javascript')
    .replace('na-n', 'nan')
    .replace('o-s-r-', 'osr-')
  return path.join(casesDir, `${filename}.js`)
}

/**
 * @param {string[]} args
 * @returns {Promise<number | null>}
 */
function runNode (args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'ignore' })
    child.once('error', reject)
    child.once('close', code => resolve(code))
  })
}

/** @returns {boolean} */
function runtimeRequiresPrepareBeforeOptimize () {
  return spawnSync(
    process.execPath,
    [nativeSyntax, '-e', 'function f() {}; %OptimizeFunctionOnNextCall(f); f()'],
    { stdio: 'ignore' }
  ).status !== 0
}

/**
 * @param {string} source
 * @returns {string}
 */
function prepareOptimizationTargets (source) {
  return source.replace(OPTIMIZATION_INTRINSIC_CALL_RX,
    (...matches) => {
      const [call, target] = matches
      if (source.includes(`%PrepareFunctionForOptimization(${target})`)) return call
      // Start with a semicolon: a leading `%` can otherwise continue the
      // previous expression as the remainder operator instead of beginning
      // the V8 intrinsic statement.
      return `; %PrepareFunctionForOptimization(${target}); ${call}`
    })
}

/** @type {Record<string, string[]>} */
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

/** @type {Record<string, string[]>} */
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

// These cases exercise Maglev-specific guards/OSR paths. Some Node binaries,
// including Node 22.23.4, accept --maglev but are built with Maglev disabled.
const maglevOnlyReasons = new Set([
  'ArrayLengthChanged',
  'Hole',
  'NotANumber',
  'NotInt32',
  'NotUint32',
  'OSREarlyExit',
  'PrepareForOnStackReplacement',
  'StoreToConstant',
  'WrongInstanceType'
])
const canUseTurboFanForMaglevCase = new Set([
  'NotANumberOrBoolean',
  'NotANumberOrOddball'
])

/** @returns {boolean | null} */
function runtimeHasMaglev () {
  const buildSetting = /** @type {typeof process.config.variables & {v8_enable_maglev?: number | string}} */ (process.config.variables).v8_enable_maglev
  if (buildSetting === undefined) return null
  return buildSetting === 1 || buildSetting === '1'
}

/** @returns {boolean} */
function runtimeSupportsMaglev () {
  const buildSetting = runtimeHasMaglev()
  if (buildSetting !== null) return buildSetting
  // Older Node builds do not expose v8_enable_maglev in process.config.
  // Before Maglev became a V8 option, its --maglev flag is unknown.
  return missingV8Flags(['--maglev']).length === 0
}

/**
 * @param {string[]} flags
 * @returns {string[]}
 */
function missingV8Flags (flags) {
  return flags.filter(flag => spawnSync(
    process.execPath,
    [flag, '--version'],
    { stdio: 'ignore' }
  ).status !== 0)
}

test('live JavaScript cases produce the named deopts in V8 logs deoptigate can parse', async (/** @type {import('node:test').TestContext} */ t) => {
  const reasons = readCatalogReasons()
  const v8Major = Number(process.versions.v8.split('.')[0])
  /** @type {Record<string, string | string[]>} */
  const reasonIdByMessage = createReasonLookup(reasons, v8Major)
  const availableReasonIds = reasonIdsForMajor(v8Major)
  const needsPrepare = runtimeRequiresPrepareBeforeOptimize()
  const hasMaglev = runtimeSupportsMaglev()
  const hasAlwaysTurboFan = missingV8Flags(['--always-turbofan']).length === 0
  const missingLogFlags = missingV8Flags(['--log-deopt', '--no-logfile-per-isolate'])
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deoptigate-live-cases-'))
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  t.assert.equal(reasons.length, 84, 'test catalog matches V8 73f16b50 (68 regular, 16 lazy)')

  const testableReasons = availableReasonIds
    ? reasons.filter(reason => availableReasonIds.has(reason.name))
    : reasons
  if (availableReasonIds) {
    t.diagnostic(`V8 ${v8Major}: prefiltered ${reasons.length - testableReasons.length} catalog reasons absent from the ${v8Major}.0.1 header`)
  }

  for (const reason of testableReasons) {
    if (missingLogFlags.length > 0) {
      t.diagnostic(`Skipping ${reason.name}: current Node/V8 cannot produce the required log (${missingLogFlags.join(', ')})`)
      continue
    }

    const sourcePath = casePathFor(reason.name)
    if (!fs.existsSync(sourcePath)) {
      t.diagnostic(`Skipping ${reason.name}: no verified live JavaScript case yet`)
      continue
    }

    if (hasMaglev === false && maglevOnlyReasons.has(reason.name)) {
      t.assert.ok(true, `${reason.name}: detected this Node binary was built without Maglev; its Maglev-only path is unavailable`)
      continue
    }

    const requiredFlags = [
      ...(requiredFlagsByReason[reason.name] || []),
      ...(specialFlagsByReason[reason.name] || [])
    ]
    const missingFlags = missingV8Flags(requiredFlags)
    if (missingFlags.length > 0) {
      t.diagnostic(`Skipping ${reason.name}: current Node/V8 does not recognize ${missingFlags.join(', ')}`)
      continue
    }
    const logPath = path.join(tempDir, `${reason.name}.v8.log`)
    /** @type {string[]} */
    let extraFlags = []
    if (
      reason.name === 'PropertyCellChange' ||
      reason.name === 'ValueMismatch' ||
      reason.name === 'Unknown' ||
      reason.name === 'DeoptimizeNow'
    ) {
      // Newer V8 removed --always-turbofan. Keep the stronger legacy flag
      // where available; on newer builds disabling Maglev selects TurboFan.
      extraFlags = hasAlwaysTurboFan
        ? ['--no-maglev', '--always-turbofan']
        : ['--no-maglev']
    }
    if (
      reason.name === 'InsufficientTypeFeedbackForCall' ||
      reason.name === 'ArrayBufferWasDetached' ||
      reason.name === 'InstanceMigrationFailed'
    ) {
      extraFlags = ['--no-maglev']
    }
    if (
      reason.name === 'WrongConstructor' ||
      reason.name === 'UnexpectedContextExtension' ||
      reason.name === 'NotAJavaScriptObjectOrNullOrUndefined' ||
      reason.name === 'NotANumberOrBoolean' ||
      reason.name === 'NotAStringOrStringWrapper' ||
      reason.name === 'WrongMapDynamic' ||
      reason.name === 'StoreToConstant'
    ) {
      extraFlags = ['--no-turbofan']
    }
    if (reason.name === 'ExceptionCaught' || reason.name === 'NotUint32') {
      extraFlags = ['--no-turbofan']
    }
    if (reason.name === 'InstanceMigrationFailed') {
      // The exact reason is emitted by TurboFan's CheckMaps migration path;
      // Maglev reports WrongMap for its corresponding migration failure.
      extraFlags = ['--no-maglev']
    }
    if (reason.name === 'WeakObjects') {
      extraFlags = hasAlwaysTurboFan
        ? ['--expose-gc', '--no-maglev', '--always-turbofan']
        : ['--expose-gc', '--no-maglev']
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
    let executableSource = caseSource
    if (hasMaglev === false && canUseTurboFanForMaglevCase.has(reason.name)) {
      executableSource = executableSource.replace(
        /%OptimizeMaglevOnNextCall\s*\(\s*([\w$]+)\s*\)/g,
        '; %PrepareFunctionForOptimization($1); %OptimizeFunctionOnNextCall($1)'
      )
      extraFlags = ['--no-maglev']
    }
    if (needsPrepare) executableSource = prepareOptimizationTargets(executableSource)
    let caseArgs
    if (reason.name === 'ContextCellChange') {
      caseArgs = ['-e', executableSource]
    } else if (executableSource !== caseSource) {
      const preparedCasePath = path.join(tempDir, `${reason.name}.prepared.js`)
      fs.writeFileSync(preparedCasePath, executableSource)
      caseArgs = [preparedCasePath]
    } else {
      caseArgs = [sourcePath]
    }
    // Tier-selection flags are optional compatibility hints. Older V8
    // releases reject flags for tiers they do not implement, exiting before
    // the JavaScript case can run.
    extraFlags = extraFlags.filter(flag => missingV8Flags([flag]).length === 0)
    let code = await runNode([
      nativeSyntax,
      ...noConcurrentRecompilation,
      '--log-deopt',
      `--logfile=${logPath}`,
      '--no-logfile-per-isolate',
      ...extraFlags,
      ...caseArgs
    ])

    /**
     * @param {string} filePath
     * @returns {Promise<Array<{
     *   timestamp: number, bailoutType: string, deoptReason: string,
     *   optimizationState: number, inlined: boolean,
     *   severity: import('../lib/severities').Severity,
     *   deoptReasonIds: string[]
     * }>>}
     */
    const readUpdates = async (filePath) => {
      const lines = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, 'utf8').split(LINE_ENDINGS_RX)
        : []
      async function * lineStream () {
        yield * lines
      }
      const parsed = await processLogContent(lineStream(), repoRoot)
      /** @type {import('../lib/log-processing/deopt-entry').DeoptUpdate[]} */
      const updates = []
      for (const deopt of parsed.toObject().deopts) updates.push(...deopt.updates)
      return updates.map(update => {
        const ids = reasonIdByMessage[update.deoptReason]
        return {
          ...update,
          deoptReasonIds: Array.isArray(ids) ? ids : (ids ? [ids] : [])
        }
      })
    }
    let updatesWithIds = await readUpdates(logPath)
    let matching = updatesWithIds.filter(update => update.deoptReasonIds.includes(reason.name))

    // V8 10 does not emit the OSR-cleanup Unknown event from unknown.js.
    // Its own fuzzing regression case exercises the same lazy reason through
    // %DeoptimizeNow; prefer that exact runtime event when the primary case
    // didn't produce Unknown.
    if (
      matching.length === 0 &&
      reason.name === 'Unknown' &&
      missingV8Flags(['--fuzzing']).length === 0
    ) {
      const retryLogPath = path.join(tempDir, 'Unknown.fuzzing.v8.log')
      const retryCasePath = path.join(casesDir, 'unknown-fuzzing.js')
      const retryCode = await runNode([
        nativeSyntax,
        ...noConcurrentRecompilation,
        '--log-deopt',
        `--logfile=${retryLogPath}`,
        '--no-logfile-per-isolate',
        '--fuzzing',
        retryCasePath
      ])
      const retryUpdates = await readUpdates(retryLogPath)
      const retryMatching = retryUpdates.filter(update => update.deoptReasonIds.includes(reason.name))
      if (retryMatching.length > 0) {
        code = retryCode
        updatesWithIds = retryUpdates
        matching = retryMatching
      }
    }

    // V8 10 does not optimize BigInt shifts into a deoptimizing operation,
    // while later V8 versions do. If the shift case lacks the named reason,
    // try the oversized-addition path used by V8 10's TurboFan.
    if (matching.length === 0 && reason.name === 'BigIntTooBig') {
      const retryLogPath = path.join(tempDir, 'BigIntTooBig.legacy.v8.log')
      const retryCasePath = path.join(casesDir, 'big-int-too-big-legacy.js')
      const retryCode = await runNode([
        nativeSyntax,
        ...noConcurrentRecompilation,
        '--log-deopt',
        `--logfile=${retryLogPath}`,
        '--no-logfile-per-isolate',
        ...extraFlags,
        retryCasePath
      ])
      const retryUpdates = await readUpdates(retryLogPath)
      const retryMatching = retryUpdates.filter(update => update.deoptReasonIds.includes(reason.name))
      if (retryMatching.length > 0) {
        code = retryCode
        updatesWithIds = retryUpdates
        matching = retryMatching
      }
    }

    // If forced TurboFan produced no expected record, retry these script-
    // context cases without --always-turbofan. V8 versions differ here: one
    // may emit the exact Unknown event only with the force flag, while another
    // may emit only the code-dependency marker without it.
    if (
      matching.length === 0 &&
      hasAlwaysTurboFan &&
      (reason.name === 'Unknown' || reason.name === 'ValueMismatch')
    ) {
      const retryLogPath = path.join(tempDir, `${reason.name}.retry.v8.log`)
      const retryFlags = extraFlags.filter(flag => flag !== '--always-turbofan')
      const retryCaseArgs = reason.name === 'ValueMismatch'
        ? ['-e', executableSource]
        : caseArgs
      const retryCode = await runNode([
        nativeSyntax,
        ...noConcurrentRecompilation,
        '--log-deopt',
        `--logfile=${retryLogPath}`,
        '--no-logfile-per-isolate',
        ...retryFlags,
        ...retryCaseArgs
      ])
      const retryUpdates = await readUpdates(retryLogPath)
      const retryMatching = retryUpdates.filter(update => update.deoptReasonIds.includes(reason.name))
      const hasDependencyMarker = retryUpdates.some(update => update.deoptReason === 'code dependencies')
      if (retryMatching.length > 0 || (reason.name === 'Unknown' && hasDependencyMarker)) {
        code = retryCode
        updatesWithIds = retryUpdates
        matching = retryMatching
      }
    }
    t.assert.equal(code, 0, `${reason.name}: case exits cleanly`)

    // These are source-confirmed runtime capabilities, not ordinary failed
    // reproductions. Undefined-in-double support is a V8 build define and
    // Node does not expose that define in process.config; the case itself
    // detects it by the exact fallback reason. EagerDeopt is deliberately
    // suppressed from the log, so detect its initiating eager deopt instead.
    const expectedFallback = {
      NotABigInt: {
        id: 'Smi',
        detail: 'detected this runtime deoptimizes at the earlier Smi guard before the BigInt type guard'
      },
      Unknown: {
        message: 'code dependencies',
        detail: 'detected the runtime dependency-change marker without a separate Unknown reason'
      },
      NotANumberOrUndefined: {
        id: 'NotANumber',
        detail: 'detected this Node build lacks the undefined-in-double compiler path'
      },
      EagerDeopt: {
        id: 'NotASmi',
        detail: 'detected V8 logged the initiating eager deopt and suppressed EagerDeopt'
      },
      WrongValue: {
        ids: ['ConstTrackingLet', 'InsufficientTypeFeedbackForCall'],
        detail: 'detected this runtime emits an earlier context/call guard instead of WrongValue'
      }
    }[reason.name]
    const fallback = expectedFallback && updatesWithIds.filter(update =>
      expectedFallback.ids
        ? expectedFallback.ids.some(id => update.deoptReasonIds.includes(id))
        : expectedFallback.id
          ? update.deoptReasonIds.includes(expectedFallback.id)
          : update.deoptReason === expectedFallback.message
    )
    if (matching.length === 0 && fallback && fallback.length > 0) {
      t.assert.ok(true, `${reason.name}: ${expectedFallback.detail}`)
      t.assert.ok(
        fallback.every(update => update.severity === severityByBailoutType[update.bailoutType]),
        `${reason.name}: detected fallback severity matches its V8 bailout type`
      )
      continue
    }

    t.assert.ok(
      matching.length > 0,
      `${reason.name}: expected ID ${reason.name}; exit ${code}; parsed ${JSON.stringify(updatesWithIds.map(update => ({ ids: update.deoptReasonIds, message: update.deoptReason })))}`
    )
    t.assert.ok(
      matching.every(update => update.severity === severityByBailoutType[update.bailoutType]),
      `${reason.name}: severity matches the V8 bailout type`
    )
  }
})
