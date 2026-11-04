'use strict'

// Each test covers a defect found by auditing the package against real V8 logs
// and processes, using the same entry points that a user would reach.

const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('node:test')

const { processLog } = require('../deoptigate.log')
const groupByFile = require('../lib/grouping/group-by-file')
const DeoptEntry = require('../lib/log-processing/deopt-entry')
const { nameIcState } = require('../lib/log-processing/ic-state')
const {
  OPTIMIZATION_STATE_OPTIMIZED,
  parseOptimizationState
} = require('../lib/log-processing/optimization-state')
const markOnly = require('../lib/rendering/mark-only')
const MarkerResolver = require('../lib/rendering/marker-resolver')
const lookupDeoptimizationReason = require('../src/deoptimization-lookup')
const { urlFromState } = require('../app/lib/query-state')

const peacock = safeRequire('../app/node_modules/peacock')
const ROOT = path.join(__dirname, '..')
const DEOPTIGATE_BIN = path.join(ROOT, 'bin/deoptigate')
const MAX_CHILD_OUTPUT = 256 * 1024 * 1024

/**
 * Load an app development dependency, which is installed separately.
 * @param {string} request
 * @returns {any} The module, or null when it is not installed.
 */
function safeRequire (request) {
  try {
    return require(request)
  } catch (err) {
    return null
  }
}

/**
 * @param {import('node:test').TestContext} t
 * @returns {string} A temporary directory removed when the test ends.
 */
function temporaryDirectory (t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deoptigate-regressions-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

/**
 * Process V8 log lines against a real source file.
 * @param {import('node:test').TestContext} t
 * @param {(sourceFile: string) => string[]} createLines
 */
async function processLines (t, createLines) {
  const directory = temporaryDirectory(t)
  const sourceFile = path.join(directory, 'app.js')
  const logFile = path.join(directory, 'v8.log')
  fs.writeFileSync(sourceFile, 'function run () {}\n')
  fs.writeFileSync(logFile, `${createLines(sourceFile).join('\n')}\n`)
  const groups = await processLog(logFile, { root: directory })
  return { sourceFile, group: groups.get(sourceFile) }
}

/**
 * Render source through the plain marker renderer and remove the markup.
 * @param {string} source
 * @param {[number, number][]} locations Line and column pairs, sorted.
 * @returns {string} Source text with `|` where each marker was placed.
 */
function renderMarkers (source, locations) {
  const deopts = new Map(locations.map(([line, column], id) => [
    `run:${line}:${column}`,
    { id, severity: /** @type {const} */ (3), line, column }
  ]))
  const html = markOnly(source, new MarkerResolver({ deopts, deoptLocations: Array.from(deopts.keys()) }))
  return html
    .replace(/<span>\s*\d+: <\/span>/g, '')
    .replace(/<br>/g, '\n')
    .replace(/<a [^>]*>.<\/a>/g, '|')
    .replace(/<[^>]+>/g, '')
    .trimEnd()
}

for (const marker of ['+', "+'", "*'"]) {
  test(`optimized code with V8 tier marker ${marker} is tracked`, async (/** @type {import('node:test').TestContext} */ t) => {
    t.plan(3)
    const { group } = await processLines(t, sourceFile => [
      `code-creation,JS,1,10,0x1000,100,run ${sourceFile}:1:10,0x9000,${marker}`,
      `code-deopt,20,100,0x1010,-1,5,deopt-eager,<${sourceFile}:1:18>,wrong map`
    ])

    t.assert.equal(group?.codes.length, 1, 'the optimized function is reported')
    t.assert.equal(group?.deopts[0].functionName, 'run', 'the deopt names its function')
    t.assert.equal(
      group?.deopts[0].updates[0].optimizationState,
      OPTIMIZATION_STATE_OPTIMIZED,
      'the deopt records the optimized state'
    )
  })
}

test('Sparkplug baseline code is not reported as optimized', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  // V8 tiers a function through ~ (Ignition), ^ (Sparkplug), + (Maglev), * (TurboFan).
  t.assert.notEqual(parseOptimizationState('^'), OPTIMIZATION_STATE_OPTIMIZED)
})

test('code created at a reused address replaces the previous function', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const { group } = await processLines(t, sourceFile => [
    `code-creation,JS,1,10,0x1000,100,old ${sourceFile}:1:10,0x9000,*`,
    `code-creation,JS,1,11,0x1000,200,new ${sourceFile}:5:10,0x9100,*`,
    `code-deopt,20,100,0x1010,-1,5,deopt-eager,<${sourceFile}:6:3>,wrong map`
  ])

  t.assert.equal(group?.deopts[0].functionName, 'new', 'the deopt belongs to the live function')
  t.assert.deepEqual(
    group?.codes.map(code => code.functionName).sort(),
    ['new', 'old'],
    'both functions are reported'
  )
})

test('a malformed log record does not stop the records after it', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const { group } = await processLines(t, sourceFile => [
    `code-creation,JS,1,10,0x2000,100,bad ${sourceFile}:1:1,0x9100,?`,
    `code-creation,JS,1,11,0x1000,100,run ${sourceFile}:1:10,0x9000,*`
  ])

  t.assert.deepEqual(group?.codes.map(code => code.functionName), ['run'])
})

test('a deopt in code missing from the log keeps its source location', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const { group } = await processLines(t, sourceFile => [
    `code-deopt,20,100,0x1010,-1,5,deopt-eager,<${sourceFile}:1:18>,wrong map`
  ])

  t.assert.equal(group?.deopts[0].line, 1, 'the deopt is reported')
  t.assert.equal(group?.deopts[0].functionName, '', 'its function is unknown')
})

test('JS code created at a reused builtin address is tracked', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const { group } = await processLines(t, sourceFile => [
    'code-creation,Builtin,2,10,0x1000,100,SomeBuiltin',
    `code-creation,JS,1,11,0x1000,100,run ${sourceFile}:1:10,0x9000,*`
  ])

  t.assert.equal(group?.codes.length, 1, 'the JS function is reported')
})

test('a megadom inline cache state keeps its record', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const { group } = await processLines(t, sourceFile => [
    `code-creation,JS,1,10,0x1000,100,run ${sourceFile}:1:10,0x9000,~`,
    'LoadIC,0x1010,20,1,12,1,D,0x5,name,,'
  ])

  t.assert.equal(group?.ics.length, 1, 'the inline cache change is reported')
})

const NO_MARKERS = { resolve: () => ({ insertBefore: '', insertAfter: '' }) }

test('source text is escaped by the highlighting theme', (/** @type {import('node:test').TestContext} */ t) => {
  if (peacock == null) return t.skip('app dependencies are not installed')
  const Theme = require('../app/theme.browser')

  for (const source of [
    "const a = '<img src=x onerror=alert(1)>'",
    '// <img src=x onerror=alert(1)>',
    'const a = `<img src=x onerror=alert(1)>`',
    'const a = /<img src=x onerror=alert(1)>/'
  ]) {
    const html = new Theme(NO_MARKERS).highlight(source, { jsx: false })
    t.assert.ok(!html.includes('<img'), `escapes ${source}`)
  }

  const jsx = new Theme(NO_MARKERS).highlight('const a = <div>b &amp; c</div>', { jsx: true })
  t.assert.ok(jsx.includes('&amp;amp;'), 'escapes JSX text')
})

test('a token the theme has no renderer for is escaped', (/** @type {import('node:test').TestContext} */ t) => {
  if (peacock == null) return t.skip('app dependencies are not installed')
  const Theme = require('../app/theme.browser')
  class IncompleteTheme extends Theme {
    /** @override */
    get theme () {
      const theme = super.theme
      delete theme.Line
      theme.String = { _default: undefined }
      return theme
    }
  }

  const html = new IncompleteTheme(NO_MARKERS).highlight("'<img src=x>' // <img src=y>", { jsx: false })
  t.assert.ok(!html.includes('<img'))
  t.assert.ok(html.includes('&lt;img src=y&gt;'), 'keeps the unstyled text readable')
})

test('a token without an end location gets no markers', (/** @type {import('node:test').TestContext} */ t) => {
  if (peacock == null) return t.skip('app dependencies are not installed')
  const Theme = require('../app/theme.browser')
  const { placeholder } = require('../app/lib/render-highlighted')
  const resolver = { resolve: t.mock.fn(() => ({ insertBefore: '', insertAfter: '' })) }
  const renderer = /** @type {any} */ (new Theme(resolver).theme).Line._default

  t.assert.equal(renderer('// a', { tokens: [{ loc: { end: null } }], tokenIndex: 0 }), placeholder(0))
  t.assert.equal(resolver.resolve.mock.callCount(), 0)
})

test('highlighted code keeps its colours and markers', (/** @type {import('node:test').TestContext} */ t) => {
  if (peacock == null) return t.skip('app dependencies are not installed')
  const Theme = require('../app/theme.browser')
  const marker = { resolve: () => ({ insertBefore: '<a>', insertAfter: '</a>' }) }

  const html = new Theme(marker).highlight('const a = 1', { jsx: false })
  t.assert.match(html, /<a><span class=\S+>const<\/span><\/a>/)
})

/** Load CodeView with its JSX transformed and its browser dependencies stubbed. */
function loadCodeView () {
  const esbuild = require('../app/node_modules/esbuild')
  const filename = path.join(ROOT, 'app/components/code.js')
  const { code } = esbuild.transformSync(fs.readFileSync(filename, 'utf8'), {
    loader: 'jsx',
    jsxFactory: 'Preact.createElement',
    format: 'cjs'
  })
  /** @type {Record<string, unknown>} */
  const modules = {
    preact: { Component: class {} },
    'scroll-into-view-if-needed': () => {},
    '../theme.browser': require('../app/theme.browser'),
    '../../lib/assert': require('../lib/assert'),
    '../../lib/rendering/marker-resolver': MarkerResolver,
    '../../lib/rendering/mark-only': markOnly,
    '../../lib/rendering/escape-html': require('../lib/rendering/escape-html')
  }
  const module = { exports: /** @type {{CodeView: {prototype: {shouldComponentUpdate: (next: object) => boolean, _tryHighlightCode: (theme: object, resolver: object) => string}}}} */ ({}) }
  // This test evaluates transformed CommonJS code as a module.
  // eslint-disable-next-line no-new-func
  const load = new Function('require', 'module', 'exports', code)
  load((/** @type {string} */ request) => modules[request], module, module.exports)
  return module.exports.CodeView
}

test('a hashbang line is escaped in the code view and keeps its colours', (/** @type {import('node:test').TestContext} */ t) => {
  try {
    require.resolve('../app/node_modules/esbuild')
  } catch (err) {
    return t.skip('app dependencies are not installed')
  }
  const CodeView = loadCodeView()
  const Theme = require('../app/theme.browser')
  const resolver = new MarkerResolver({})
  const html = CodeView.prototype._tryHighlightCode.call({
    props: { fileName: 'bin.js', code: '#!/usr/bin/env node <img src=x onerror=alert(1)>\nrun()\n' }
  }, new Theme(resolver), resolver)

  t.assert.ok(!html.includes('<img'))
  t.assert.ok(html.includes('#!/usr/bin/env node &lt;img src=x onerror=alert(1)&gt;'), 'shows the line as text')
  t.assert.match(html, /<span class=\S+>run<\/span>/, 'colours the rest of the file')
})

test('plain marker rendering keeps source text intact with several markers on a line', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  t.assert.equal(renderMarkers('abcdef', [[1, 1], [1, 4]]).replace(/\|/g, ''), 'abcdef')
  t.assert.equal(renderMarkers('const x = 1', [[1, 7], [1, 11]]).replace(/\|/g, ''), 'const x = 1')
})

test('plain marker rendering keeps a marker past the line end on its own line', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const [first, second] = renderMarkers('ab\ncdefgh', [[1, 2], [1, 3]]).split('\n')
  t.assert.deepEqual([first.split('|').length - 1, second.includes('|')], [2, false])
})

test('a CodeView re-renders when another file has identical source', (/** @type {import('node:test').TestContext} */ t) => {
  try {
    require.resolve('../app/node_modules/esbuild')
  } catch (err) {
    return t.skip('app dependencies are not installed')
  }
  const shared = { code: 'same source', selectedLocation: null, includeAllSeverities: false }
  const current = { ...shared, fileName: '/app/a.js', deopts: new Map() }
  const next = { ...shared, fileName: '/app/b.js', deopts: new Map([['run:1:1', {}]]) }
  t.assert.equal(loadCodeView().prototype.shouldComponentUpdate.call({ props: current }, next), true)
})

test('the standalone SIGINT preload exits cleanly', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const child = spawn(process.execPath, [
    '-r', path.join(ROOT, 'bin/soft-exit.js'),
    '-e', "setInterval(() => {}, 1000); console.log('ready')"
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  child.stdout.once('data', () => child.kill('SIGINT'))
  const code = await new Promise(resolve => child.once('close', resolve))

  t.assert.equal(code, 0, 'Ctrl+C ends the profiled process successfully')
  t.assert.doesNotMatch(stderr, /ERR_INVALID_ARG_TYPE/, 'the handler does not throw')
})

test('collecting into a path containing a percent sign writes its log there', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const directory = path.join(temporaryDirectory(t), 'profile%pdata')
  const script = `
    const ClinicDeoptigate = require(${JSON.stringify(path.join(ROOT, 'src'))})
    const profiler = new ClinicDeoptigate({ dest: ${JSON.stringify(directory)}, name: 'run' })
    profiler.collect([ process.execPath, '-e', '0' ], (err, dataPath) => {
      process.stderr.write('\\nRESULT ' + JSON.stringify(require('fs').readdirSync(dataPath)))
    })
  `
  // V8 falls back to stdout here, so the child's output has to be captured.
  const { stderr } = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', maxBuffer: MAX_CHILD_OUTPUT })
  t.assert.match(stderr.slice(stderr.lastIndexOf('RESULT')), /v8\.log/)
})

test('a spawn failure during port detection reaches the collect callback', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const directory = temporaryDirectory(t)
  const script = `
    const ClinicDeoptigate = require(${JSON.stringify(path.join(ROOT, 'src'))})
    process.on('uncaughtException', err => {
      console.log('uncaught')
      process.exit(0)
    })
    new ClinicDeoptigate({ dest: ${JSON.stringify(directory)}, name: 'run', detectPort: true })
      .collect([ 'invalid\\0path', 'app.js' ], () => {
        console.log('callback')
        process.exit(0)
      })
  `
  const { stdout } = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' })
  t.assert.equal(stdout.trim(), 'callback')
})

test('the CLI does not report a stale log when the profiled process never starts', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const directory = temporaryDirectory(t)
  const reportDirectory = path.join(directory, 'deoptigate')
  const staleSource = path.join(directory, 'previous-run.js')
  fs.mkdirSync(reportDirectory)
  fs.writeFileSync(staleSource, 'function previousRun () {}\n')
  fs.writeFileSync(
    path.join(reportDirectory, 'v8.log'),
    `code-creation,JS,1,10,0x1000,100,previousRun ${staleSource}:1:10,0x9000,*\n`
  )

  spawnSync(process.execPath, [DEOPTIGATE_BIN, '--', 'node', '--not-a-real-node-flag', 'app.js'], {
    cwd: directory,
    env: { ...process.env, TMPDIR: directory },
    encoding: 'utf8'
  })

  const renderData = path.join(reportDirectory, 'deoptigate.render-data.js')
  const report = fs.existsSync(renderData) ? fs.readFileSync(renderData, 'utf8') : ''
  t.assert.ok(!report.includes('previousRun'), 'data from the previous run is not presented as this run')
})

test('the CLI keeps its log directory private while the profiled process runs', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const directory = temporaryDirectory(t)
  const script = path.join(directory, 'app.js')
  fs.writeFileSync(script, `
    const { statSync } = require('fs')
    const { join } = require('path')
    console.log('MODE ' + (statSync(join(require('os').tmpdir(), 'deoptigate')).mode & 0o777).toString(8))
  `)

  const { stdout } = spawnSync(process.execPath, [DEOPTIGATE_BIN, script], {
    cwd: directory,
    env: { ...process.env, TMPDIR: directory },
    encoding: 'utf8'
  })
  t.assert.match(stdout, /MODE 700/)
})

test('log selection accepts a corrected choice from piped input', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const directory = temporaryDirectory(t)
  fs.writeFileSync(path.join(directory, 'v8.log'), '')
  fs.writeFileSync(path.join(directory, 'isolate-1-v8.log'), '')

  const { stderr } = spawnSync(process.execPath, [DEOPTIGATE_BIN], {
    cwd: directory,
    env: { ...process.env, TMPDIR: directory },
    input: 'invalid\n1\n',
    encoding: 'utf8'
  })
  t.assert.doesNotMatch(stderr, /closed before a choice/)
})

test('deoptimization lookup treats inherited object keys as unknown reasons', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  for (const key of ['constructor', 'toString', '__proto__']) {
    t.assert.equal(lookupDeoptimizationReason(key), null, key)
  }
})

test('a source directory containing the inlining separator is parsed', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition('</src/case inlined at home/app.js:1:2>'),
    { file: '/src/case inlined at home/app.js', line: 1, column: 2 }
  )
})

test("a user's bin/soft-exit.js stays in the report", (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const file = '/project/bin/soft-exit.js'
  const groups = groupByFile(
    { ics: [], deopts: [{ file }], codes: [] },
    new Map([[file, { fullPath: file, relativePath: 'bin/soft-exit.js', src: '' }]])
  )
  t.assert.equal(groups.size, 1)
})

test('the uninitialized inline cache state is spelled correctly', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  t.assert.equal(nameIcState(0), 'uninitialized')
})

test('report URLs stay usable on opaque file origins', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'null', pathname: '/tmp/deoptigate/index.html' }
  })
  t.after(() => {
    if (descriptor == null) Reflect.deleteProperty(globalThis, 'location')
    else Object.defineProperty(globalThis, 'location', descriptor)
  })

  t.assert.ok(!urlFromState({ selectedTabIdx: 1 }).startsWith('null'))
})
