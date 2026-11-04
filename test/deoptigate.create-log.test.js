'use strict'

const Module = require('module')
const path = require('path')
const { test } = require('node:test')
const { EventEmitter } = require('events')

const createLogPath = path.join(__dirname, '../bin/deoptigate.create-log.js')

/**
 * @typedef {object} CreateLogTestOptions
 * @property {boolean=} exists
 * @property {boolean=} isDirectory
 * @property {number | null=} exitCode
 * @property {string=} nodeVersion
 * @property {string=} logDir
 * @property {boolean=} ignoreSigterm
 * @property {boolean=} spawnError
 * @property {boolean=} interruptChild
 * @property {Error=} statError
 * @property {Error=} unlinkError
 */
/**
 * @typedef {object} CreateLogTestState
 * @property {boolean} exists
 * @property {boolean} isDirectory
 * @property {number | null} exitCode
 * @property {string} nodeVersion
 * @property {string} logDir
 * @property {boolean=} ignoreSigterm
 * @property {boolean=} spawnError
 * @property {boolean=} interruptChild
 * @property {Error=} statError
 * @property {Error=} unlinkError
 * @property {{node: string, args: (string | undefined)[], spawnOptions: {stdio: string[]}}[]} spawnCalls
 * @property {string[]} killSignals
 * @property {string[]} mkdirCalls
 * @property {[string, number][]} accessCalls
 * @property {string[]} statCalls
 * @property {[string, number][]} chmodCalls
 * @property {string[]} unlinkCalls
 * @property {{recursive?: boolean, mode?: number}[]} mkdirOptions
 * @property {EventEmitter & {versions: {node: string}, execPath: string, exitCode?: number | null}} processInfo
 * @property {(args: string[], head: string, simpleHead: string) => Promise<string>} createLog
 */

/**
 * Load create-log with stubbed process and filesystem dependencies.
 * @param {CreateLogTestOptions} [options]
 * @returns {CreateLogTestState}
 */
function loadCreateLog (options = {}) {
  /** @type {CreateLogTestState} */
  const state = Object.assign({
    exists: false,
    isDirectory: true,
    exitCode: 0,
    nodeVersion: '16.0.0',
    logDir: '/tmp/deoptigate-create-log-test',
    spawnCalls: [],
    killSignals: [],
    mkdirCalls: [],
    accessCalls: [],
    statCalls: [],
    chmodCalls: [],
    unlinkCalls: [],
    mkdirOptions: [],
    processInfo: Object.assign(new EventEmitter(), {
      versions: { node: '16.0.0' },
      execPath: process.execPath
    }),
    createLog: async () => ''
  }, options)

  const fakeFs = {
    constants: { F_OK: 0 },
    /**
     * @param {string} file
     * @param {number} mode
     * @param {(error: NodeJS.ErrnoException | null) => void} callback
     */
    access (file, mode, callback) {
      state.accessCalls.push([file, mode])
      if (state.exists) return callback(null)
      callback(Object.assign(new Error('not found'), { code: 'ENOENT' }))
    },
    /**
     * @param {string} file
     * @param {{recursive?: boolean, mode?: number}} options
     * @param {(error: NodeJS.ErrnoException | null) => void} callback
     */
    mkdir (file, options, callback) {
      state.mkdirCalls.push(file)
      state.mkdirOptions.push(options)
      callback(null)
    },
    /**
     * @param {string} file
     * @param {number} mode
     * @param {(error: NodeJS.ErrnoException | null) => void} callback
     */
    chmod (file, mode, callback) {
      state.chmodCalls.push([file, mode])
      callback(null)
    },
    /**
     * @param {string} file
     * @param {(error: NodeJS.ErrnoException | null) => void} callback
     */
    unlink (file, callback) {
      state.unlinkCalls.push(file)
      callback(state.unlinkError || Object.assign(new Error('not found'), { code: 'ENOENT' }))
    },
    /**
     * @param {string} file
     * @param {(error: NodeJS.ErrnoException | null, stats?: {isDirectory: () => boolean}) => void} callback
     */
    stat (file, callback) {
      state.statCalls.push(file)
      if (state.statError) return callback(/** @type {NodeJS.ErrnoException} */ (state.statError))
      if (!state.exists) {
        callback(Object.assign(new Error('not found'), { code: 'ENOENT' }))
        return
      }
      callback(null, { isDirectory: () => state.isDirectory })
    }
  }
  state.processInfo = Object.assign(new EventEmitter(), {
    versions: { node: state.nodeVersion },
    execPath: process.execPath
  })

  const originalRequire = Module.prototype.require
  const originalLog = console.log
  Module.prototype.require = function (request) {
    if (request === 'child_process') {
      return {
        /**
         * @param {string} node
         * @param {(string | undefined)[]} args
         * @param {{stdio: string[]}} spawnOptions
         */
        spawn (node, args, spawnOptions) {
          state.spawnCalls.push({ node, args, spawnOptions })
          /** @type {EventEmitter & {exitCode: number | null, kill: (signal: string) => boolean}} */
          const childProcess = Object.assign(new EventEmitter(), {
            exitCode: null,
            kill: (/** @type {string} */ signal) => {
              state.killSignals.push(signal)
              if (!(state.ignoreSigterm && signal === 'SIGTERM')) {
                process.nextTick(() => childProcess.emit('exit', null))
              }
              return true
            }
          })
          if (state.spawnError) {
            process.nextTick(() => childProcess.emit('error', new Error('spawn failed')))
          } else if (state.interruptChild) {
            process.nextTick(() => state.processInfo.emit('SIGINT'))
          } else {
            process.nextTick(() => {
              childProcess.exitCode = state.exitCode
              childProcess.emit('exit', state.exitCode)
            })
          }
          return childProcess
        }
      }
    }
    if (request === 'os') return { tmpdir: () => state.logDir }
    if (request === 'fs') return fakeFs
    if (request === 'process') return state.processInfo
    return originalRequire.call(this, request)
  }
  console.log = () => {}
  delete require.cache[createLogPath]

  try {
    state.createLog = require(createLogPath)
  } finally {
    Module.prototype.require = originalRequire
    console.log = originalLog
  }
  return state
}

test('create-log creates missing log directory and spawns the requested script', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(7)
  const state = loadCreateLog()
  const logPath = await state.createLog(['script.js', '--example'], 'head', 'simple')

  t.assert.equal(logPath, `${state.logDir}/deoptigate/v8.log`, 'returns the v8 log path')
  t.assert.deepEqual(state.mkdirCalls, [`${state.logDir}/deoptigate`], 'creates a missing log directory')
  t.assert.deepEqual(state.spawnCalls[0].args.slice(-2), ['script.js', '--example'], 'passes app arguments through')
  t.assert.equal(state.spawnCalls[0].args[0], '--log-ic', 'enables inline cache logging on supported Node')
  t.assert.equal(state.spawnCalls[0].args[1], '--log-deopt', 'enables deoptimization logging')
  const preloadIndex = state.spawnCalls[0].args.indexOf('-r')
  t.assert.equal(state.spawnCalls[0].args[preloadIndex + 1], path.join(__dirname, '../bin/soft-exit.js'), 'preloads the child SIGINT handler')
  t.assert.deepEqual(state.spawnCalls[0].spawnOptions.stdio, ['ignore', 'inherit', 'inherit'], 'inherits child output')
})

test('create-log preserves a nonzero profiled process exit code', async (
  /** @type {import('node:test').TestContext} */ t
) => {
  t.plan(2)
  const state = loadCreateLog({ exitCode: 7 })
  const logPath = await state.createLog(['script.js'], 'head', 'simple')

  t.assert.equal(logPath, `${state.logDir}/deoptigate/v8.log`, 'still returns the generated V8 log path')
  t.assert.equal(state.processInfo.exitCode, 7, 'lets the CLI report the profiled process failure to its caller')
})

test('create-log parses node flags, app args, and a custom Node executable', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(7)
  const state = loadCreateLog({ exists: true, exitCode: null })
  const logPath = await state.createLog([
    '--', '/custom/node', '--allow-natives-syntax',
    'app.js', '--app-flag'
  ], 'head', 'simple')

  t.assert.equal(logPath, `${state.logDir}/deoptigate/v8.log`, 'returns the generated log path')
  t.assert.equal(state.mkdirCalls.length, 0, 'does not recreate an existing directory')
  t.assert.deepEqual(state.statCalls, [`${state.logDir}/deoptigate`], 'checks that existing log path is a directory')
  t.assert.equal(state.spawnCalls[0].node, '/custom/node', 'uses the requested Node executable')
  t.assert.deepEqual(state.spawnCalls[0].args.slice(-2), ['app.js', '--app-flag'], 'passes only app arguments')
  t.assert.ok(state.spawnCalls[0].args.includes('--allow-natives-syntax'), 'passes Node flags')
  t.assert.ok(state.spawnCalls[0].args.indexOf('app.js') < state.spawnCalls[0].args.indexOf('--app-flag'), 'keeps app flags after the app path')
})

test('create-log removes the previous log and keeps its directory private', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  const state = loadCreateLog()
  await state.createLog(['app.js'], 'head', 'simple')
  t.assert.deepEqual(state.unlinkCalls, [`${state.logDir}/deoptigate/v8.log`], 'removes the previous log')
  t.assert.equal(state.mkdirOptions[0].mode, 0o700, 'creates the directory privately')
  t.assert.deepEqual(state.chmodCalls, [[`${state.logDir}/deoptigate`, 0o700]], 'tightens an existing directory')
})

test('create-log rethrows unexpected errors removing the previous log', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const unlinkError = Object.assign(new Error('denied'), { code: 'EACCES' })
  const state = loadCreateLog({ unlinkError })
  await t.assert.rejects(state.createLog(['app.js'], 'head', 'simple'), unlinkError)
  t.assert.equal(state.spawnCalls.length, 0, 'does not start the process')
})

test('create-log escapes percent signs in the V8 log path', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const state = loadCreateLog({ logDir: '/tmp/100%p' })
  await state.createLog(['app.js'], 'head', 'simple')
  t.assert.ok(state.spawnCalls[0].args.includes('--logfile=/tmp/100%%p/deoptigate/v8.log'))
})

test('create-log forwards a separator that belongs to the app', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const state = loadCreateLog()
  await state.createLog(['app.js', '--', '--port', '3000'], 'head', 'simple')
  t.assert.deepEqual(state.spawnCalls[0].args.slice(-4), ['app.js', '--', '--port', '3000'])
})

test('create-log keeps node -e and its source together', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const state = loadCreateLog()
  await state.createLog(['--', 'node', '-e', 'console.log(1)'], 'head', 'simple')
  const { args } = state.spawnCalls[0]
  t.assert.equal(args[args.indexOf('-e') + 1], 'console.log(1)')
})

test('create-log does not mistake a node flag value for the app', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const state = loadCreateLog()
  await state.createLog(['--', 'node', '--trace-event-categories', 'v8', 'app.js'], 'head', 'simple')
  const { args } = state.spawnCalls[0]
  t.assert.equal(args[args.indexOf('--trace-event-categories') + 1], 'v8')
})

test('create-log supports the node executable and legacy IC flag', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  const state = loadCreateLog({ nodeVersion: '15.0.0' })
  await state.createLog(['--', 'node', '--trace-warnings', 'app.js'], 'head', 'simple')
  t.assert.equal(state.spawnCalls[0].node, process.execPath, 'uses the default Node executable')
  t.assert.deepEqual(state.spawnCalls[0].args.slice(-1), ['app.js'], 'passes app arguments after Node flags')
  t.assert.equal(state.spawnCalls[0].args[0], '--trace-ic', 'uses the legacy inline-cache flag')
  t.assert.ok(state.spawnCalls[0].args.includes('--trace-warnings'), 'passes Node flags through')
})

test('create-log keeps separate Node flag values before the application script', async (
  /** @type {import('node:test').TestContext} */ t
) => {
  const state = loadCreateLog()
  await state.createLog([
    '--', 'node', '--require', './preload.js', 'app.js', '--app-flag'
  ], 'head', 'simple')

  const args = state.spawnCalls[0].args
  const requireIndex = args.indexOf('--require')
  t.assert.deepEqual(args.slice(requireIndex, requireIndex + 2), ['--require', './preload.js'], 'keeps the preload value with its Node flag')
  t.assert.deepEqual(args.slice(-2), ['app.js', '--app-flag'], 'keeps the application and its arguments after Node flags')
})

test('create-log rejects Node flags that are missing their value', async (
  /** @type {import('node:test').TestContext} */ t
) => {
  const state = loadCreateLog()
  /** @type {Error | undefined} */
  let error

  try {
    await state.createLog(['--', 'node', '--require'], 'head', 'simple')
  } catch (caught) {
    if (caught instanceof Error) error = caught
    else throw caught
  }

  if (error == null) throw new Error('expected a missing Node flag value to be rejected')
  t.assert.match(error.message, /Node flag --require requires a value/, 'reports the missing Node flag value')
  t.assert.equal(state.spawnCalls.length, 0, 'does not spawn Node with a shifted preload argument')
})

test('create-log rejects flags where a Node executable is required', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  const state = loadCreateLog()
  /** @type {Error | undefined} */
  let err
  try {
    await state.createLog(['--', '--allow-natives-syntax', 'app.js'], 'head', 'simple')
  } catch (error) {
    if (error instanceof Error) err = error
    else throw error
  }
  t.assert.match(err?.message ?? '', /node binary must immediately follow/, 'rejects a flag instead of a Node executable')
  t.assert.equal(state.accessCalls.length, 0, 'validates arguments before touching the log directory')
  t.assert.equal(state.spawnCalls.length, 0, 'does not spawn on invalid arguments')
})

test('create-log rejects an existing path that is not a directory', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const state = loadCreateLog({ exists: true, isDirectory: false })
  /** @type {Error | undefined} */
  let err
  try {
    await state.createLog(['app.js'], 'head', 'simple')
  } catch (error) {
    if (error instanceof Error) err = error
    else throw error
  }
  t.assert.match(err?.message ?? '', /wasn't a directory/, 'rejects a file at the log directory path')
  t.assert.equal(state.spawnCalls.length, 0, 'does not spawn when the log path is not a directory')
})

test('create-log rethrows unexpected log-directory stat errors', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const state = loadCreateLog({ statError: new Error('stat failed') })
  /** @type {Error | undefined} */
  let err
  try {
    await state.createLog(['app.js'], 'head', 'simple')
  } catch (error) {
    if (error instanceof Error) err = error
    else throw error
  }
  t.assert.equal(err?.message, 'stat failed', 'does not treat unexpected stat failures as a missing directory')
  t.assert.equal(state.mkdirCalls.length, 0, 'does not try to create a directory after a different stat error')
})

test('create-log handles a missing node executable argument after the separator', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const state = loadCreateLog()
  await state.createLog(['--'], 'head', 'simple')
  t.assert.equal(state.spawnCalls.length, 1, 'continues through the no-executable argument branch')
  t.assert.ok(!state.spawnCalls[0].args.includes(undefined), 'does not pass an undefined child argument')
})

test('create-log terminates the child when interrupted', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const state = loadCreateLog({ interruptChild: true })
  await state.createLog(['app.js'], 'head', 'simple')
  t.assert.deepEqual(state.killSignals, ['SIGTERM'], 'asks the child to exit gracefully on SIGINT')
})

test('create-log force kills a child that ignores SIGTERM', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const state = loadCreateLog({ interruptChild: true, ignoreSigterm: true })
  const keepAlive = setInterval(() => {}, 1000)
  try {
    await state.createLog(['app.js'], 'head', 'simple')
  } finally {
    clearInterval(keepAlive)
  }
  t.assert.deepEqual(state.killSignals, ['SIGTERM', 'SIGKILL'], 'forces exit after the grace period')
})

test('create-log rejects spawn errors and removes its signal handler', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const state = loadCreateLog({ spawnError: true })
  /** @type {Error | undefined} */
  let err
  try {
    await state.createLog(['app.js'], 'head', 'simple')
  } catch (error) {
    if (error instanceof Error) err = error
    else throw error
  }
  t.assert.equal(err?.message, 'spawn failed', 'propagates the child spawn error')
  t.assert.equal(state.processInfo.listenerCount('SIGINT'), 0, 'cleans up the interrupt listener')
})
