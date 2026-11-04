const { readFile, writeFile, mkdtemp, readdir, lstat, unlink, rmdir } = require('fs').promises
const path = require('path')
const { tmpdir } = require('os')
const { spawnSync } = require('child_process')
const Module = require('module')
const test = require('node:test')
const JAVASCRIPT_SUFFIX_RX = /\.js$/

/**
 * @param {...string} args
 * @returns {string}
 */
const repoRoot = (...args) => path.join(__dirname, '..', ...args)
const binPath = repoRoot('bin/deoptigate')
const supportsDeoptLog = spawnSync(
  process.execPath,
  ['--log-deopt', '--version'],
  { stdio: 'ignore' }
).status === 0

/**
 * @typedef {{severity: number, timestamp?: number, state?: number, oldState?: number, newState?: number, bailoutType?: string, deoptReason?: string, type?: string}} RenderUpdate
 * @typedef {{line?: number, column?: number, functionName?: string, isScript?: boolean, updates: RenderUpdate[]}} RenderPoint
 * @typedef {{fullPath: string, src: string, ics: RenderPoint[], deopts: RenderPoint[], codes: RenderPoint[]}} FileRenderData
 */

/**
 * @param {string} dir
 * @returns {Promise<void>}
 */
async function removeDirectory(dir) {
  const entries = await readdir(dir).catch(err => {
    if (err.code === 'ENOENT') return []
    throw err
  })
  for (const entry of entries) {
    const entryPath = path.join(dir, entry)
    const stats = await lstat(entryPath)
    if (stats.isDirectory()) await removeDirectory(entryPath)
    else await unlink(entryPath)
  }
  await rmdir(dir).catch(err => {
    if (err.code !== 'ENOENT') throw err
  })
}

/**
 * Run the CLI against a source file and load its generated render data.
 * @param {string} srcPath
 * @returns {Promise<Array<[string, FileRenderData]>>}
 */
async function runDeoptigate(srcPath) {
  const isolatedTmpDir = await mkdtemp(path.join(tmpdir(), 'deoptigate-bin-test-'))

  try {
    const env = Object.assign({}, process.env, { TMPDIR: isolatedTmpDir })
    const result = spawnSync(process.execPath, [binPath, srcPath], { encoding: 'utf8', env })
    if (result.status !== 0) {
      const reason = result.error ? result.error.message : `exit status ${result.status}`
      throw new Error(`deoptigate CLI failed (${reason}):\n${result.stderr}`)
    }

    const renderDataPath = path.join(isolatedTmpDir, 'deoptigate', 'deoptigate.render-data.js')
    const contents = await readFile(renderDataPath, 'utf8')
    const newContents = `function deoptigateRender(info) { return info; }; \nmodule.exports = ${contents.trim()};`
    const outPath = path.join(isolatedTmpDir, 'render-data.js')
    await writeFile(outPath, newContents, 'utf8')

    /** @type {Array<[string, FileRenderData]>} */
    const renderData = require(outPath.replace(JAVASCRIPT_SUFFIX_RX, ''))
    return renderData
  } finally {
    await removeDirectory(isolatedTmpDir)
  }
}

test('deoptigate simple/adders.js', async (/** @type {import('node:test').TestContext} */ t) => {
  if (!supportsDeoptLog) {
    return t.skip('current Node/V8 does not support --log-deopt')
  }
  t.plan(10)

  const srcPath = repoRoot('examples/simple/adders.js')

  const renderData = await runDeoptigate(srcPath)
  t.assert.equal(renderData.length, 1, 'number of files')

  const fileName = renderData[0][0]
  t.assert.equal(fileName, srcPath, 'filename in render data')

  const fileData = renderData[0][1]
  t.assert.equal(fileData.fullPath, srcPath, 'fullPath')
  t.assert.ok(Array.isArray(fileData.ics), 'ics key is an Array')
  t.assert.ok(Array.isArray(fileData.deopts), 'deopts key is an Array')
  t.assert.ok(Array.isArray(fileData.codes), 'codes key is an Array')
  t.assert.ok(fileData.ics.length > 0, 'example produces inline-cache records')
  t.assert.ok(fileData.deopts.length > 0, 'example produces deoptimization records')
  t.assert.ok(fileData.codes.length > 0, 'example produces code-state records')

  const fileSrc = await readFile(srcPath, 'utf8')
  t.assert.equal(fileData.src, fileSrc, 'file source')
})

test('deoptigate two-modules/adders.js', async (/** @type {import('node:test').TestContext} */ t) => {
  if (!supportsDeoptLog) {
    return t.skip('current Node/V8 does not support --log-deopt')
  }
  t.plan(15)

  const srcPaths = [
    repoRoot('examples/two-modules/adders.js'),
    repoRoot('examples/two-modules/objects.js'),
  ]

  const renderData = await runDeoptigate(srcPaths[0])
  t.assert.equal(renderData.length, 2, 'number of files')

  const filesByName = new Map(renderData)
  let icCount = 0
  let codeCount = 0
  for (const srcPath of srcPaths) {
    const fileData = filesByName.get(srcPath)
    t.assert.ok(fileData, `render data contains ${srcPath}`)
    if (fileData == null) continue

    t.assert.equal(fileData.fullPath, srcPath, `fullPath for ${srcPath}`)
    t.assert.ok(Array.isArray(fileData.ics), `ics key is an Array for ${srcPath}`)
    t.assert.ok(Array.isArray(fileData.deopts), `deopts key is an Array for ${srcPath}`)
    t.assert.ok(Array.isArray(fileData.codes), `codes key is an Array for ${srcPath}`)
    icCount += fileData.ics.length
    codeCount += fileData.codes.length

    const fileSrc = await readFile(srcPath, 'utf8')
    t.assert.equal(fileData.src, fileSrc, `file source for ${srcPath}`)
  }
  t.assert.ok(icCount > 0, 'examples produce inline-cache records')
  t.assert.ok(codeCount > 0, 'examples produce code-state records')
})

test('CLI sets a nonzero exit status when a command fails', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const originalRequire = Module.prototype.require
  const originalError = console.error
  const originalExitCode = process.exitCode
  const originalArgv = process.argv
  /** @type {string[]} */
  const errors = []
  Module.prototype.require = function (request) {
    if (this.filename === binPath) {
      if (request === './deoptigate.generate-report') return async () => {}
      if (request === './deoptigate.select-log') return async () => 'unused.log'
      if (request === './deoptigate.create-log') return async () => { throw new Error('synthetic CLI failure') }
    }
    return originalRequire.call(this, request)
  }
  console.error = message => { errors.push(message) }
  process.argv = [ process.execPath, binPath, 'script.js' ]
  delete require.cache[binPath]

  try {
    require(binPath)
    await new Promise(resolve => setImmediate(resolve))
    t.assert.equal(process.exitCode, 1, 'caught CLI errors set a nonzero exit status')
    t.assert.match(errors[0], /synthetic CLI failure/, 'caught CLI errors are written to stderr')
  } finally {
    Module.prototype.require = originalRequire
    console.error = originalError
    process.exitCode = originalExitCode
    process.argv = originalArgv
    delete require.cache[binPath]
  }
})

test('CLI stops after reporting that no V8 log is available', async (
  /** @type {import('node:test').TestContext} */ t
) => {
  const originalRequire = Module.prototype.require
  const originalError = console.error
  const originalExitCode = process.exitCode
  const originalArgv = process.argv
  let reportCalls = 0

  Module.prototype.require = function (request) {
    if (this.filename === binPath) {
      if (request === './deoptigate.generate-report') {
        return async () => { reportCalls++ }
      }
      if (request === './deoptigate.select-log') return async () => undefined
      if (request === './deoptigate.create-log') return async () => 'unused.log'
    }
    return originalRequire.call(this, request)
  }
  console.error = () => {}
  process.argv = [ process.execPath, binPath ]
  delete require.cache[binPath]

  try {
    require(binPath)
    await new Promise(resolve => setImmediate(resolve))
    t.assert.equal(reportCalls, 0, 'does not generate a report without a selected log')
    t.assert.equal(process.exitCode, originalExitCode, 'treats the no-log message as a clean exit')
  } finally {
    Module.prototype.require = originalRequire
    console.error = originalError
    process.exitCode = originalExitCode
    process.argv = originalArgv
    delete require.cache[binPath]
  }
})

test('CLI selects JSON output before forwarding application arguments', async (
  /** @type {import('node:test').TestContext} */ t
) => {
  t.plan(5)
  const originalRequire = Module.prototype.require
  const originalError = console.error
  const originalArgv = process.argv
  /** @type {string[]} */
  let createLogArgs = []
  /** @type {string | undefined} */
  let outputFormat
  /** @type {string | undefined} */
  let outputFilter
  /** @type {(1 | 2 | 3)[] | undefined} */
  let outputSeverityFilter
  /** @type {('opt' | 'deopt' | 'ic')[] | undefined} */
  let outputTypeFilter
  Module.prototype.require = function (request) {
    if (this.filename === binPath) {
      if (request === './deoptigate.generate-report') {
        return async (
          /** @type {string} */ _log,
          /** @type {string} */ _head,
          /** @type {'html' | 'json' | 'compact_json' | 'jsonl'} */ format,
          /** @type {string | undefined} */ fileNameFilter,
          /** @type {(1 | 2 | 3)[] | undefined} */ severityFilter,
          /** @type {('opt' | 'deopt' | 'ic')[] | undefined} */ typeFilter
        ) => {
          outputFormat = format
          outputFilter = fileNameFilter
          outputSeverityFilter = severityFilter
          outputTypeFilter = typeFilter
        }
      }
      if (request === './deoptigate.select-log') return async () => undefined
      if (request === './deoptigate.create-log') {
        return async (/** @type {string[]} */ args) => {
          createLogArgs = args
          return '/tmp/deoptigate/v8.log'
        }
      }
    }
    return originalRequire.call(this, request)
  }
  console.error = () => {}
  process.argv = [ process.execPath, binPath, '--format', 'compact_json', '--filter-file-name', 'parse', '--filter-severity', '1,3', '--filter-type', 'opt,deopt', 'app.js', '--app-option' ]
  delete require.cache[binPath]

  try {
    require(binPath)
    await new Promise(resolve => setImmediate(resolve))
    t.assert.equal(outputFormat, 'compact_json', 'passes the requested format to report generation')
    t.assert.equal(outputFilter, 'parse', 'passes the path filter to report generation')
    t.assert.deepEqual(outputSeverityFilter, [ 1, 3 ], 'passes the severity filter to report generation')
    t.assert.deepEqual(outputTypeFilter, [ 'opt', 'deopt' ], 'passes the selected event type combination to report generation')
    t.assert.deepEqual(createLogArgs, [ 'app.js', '--app-option' ], 'does not pass the format option to the app')
  } finally {
    Module.prototype.require = originalRequire
    console.error = originalError
    process.argv = originalArgv
    delete require.cache[binPath]
  }
})

test('CLI preserves the profiled process exit code after generating its report', async (
  /** @type {import('node:test').TestContext} */ t
) => {
  if (!supportsDeoptLog) return t.skip('current Node/V8 does not support --log-deopt')
  t.plan(1)
  const isolatedTmpDir = await mkdtemp(path.join(tmpdir(), 'deoptigate-bin-exit-code-'))
  const srcPath = path.join(isolatedTmpDir, 'fails.js')

  try {
    await writeFile(srcPath, 'process.exitCode = 7\n', 'utf8')
    const result = spawnSync(process.execPath, [binPath, srcPath], {
      encoding: 'utf8',
      env: Object.assign({}, process.env, { TMPDIR: isolatedTmpDir })
    })

    t.assert.equal(result.status, 7, 'returns the profiled process exit code')
  } finally {
    await removeDirectory(isolatedTmpDir)
  }
})
