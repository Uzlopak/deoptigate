'use strict'

const Module = require('module')
const path = require('path')
const { test } = require('node:test')
const { EventEmitter } = require('events')

const createLogPath = path.join(__dirname, '../bin/deoptigate.create-log.js')

function loadCreateLog(options = {}) {
  const state = Object.assign({
    exists: false,
    isDirectory: true,
    exitCode: 0,
    nodeVersion: '16.0.0',
    logDir: '/tmp/deoptigate-create-log-test'
  }, options)
  state.spawnCalls = []
  state.killSignals = []
  state.mkdirCalls = []
  state.accessCalls = []
  state.statCalls = []

  const fakeFs = {
    constants: { F_OK: 0 },
    access(file, mode, callback) {
      state.accessCalls.push([ file, mode ])
      if (state.exists) return callback(null)
      const err = new Error('not found')
      err.code = 'ENOENT'
      callback(err)
    },
    mkdir(file, options, callback) {
      if (typeof options === 'function') callback = options
      state.mkdirCalls.push(file)
      callback(null)
    },
    stat(file, callback) {
      state.statCalls.push(file)
      if (!state.exists) {
        const err = new Error('not found')
        err.code = 'ENOENT'
        callback(err)
        return
      }
      callback(null, { isDirectory: () => state.isDirectory })
    }
  }
  state.processInfo = Object.assign(new EventEmitter(), {
    versions: { node: state.nodeVersion },
    execPath: process.execPath
  })

  const originalLoad = Module._load
  const originalLog = console.log
  Module._load = function (request, parent, isMain) {
    if (request === 'child_process') {
      return {
        spawn(node, args, spawnOptions) {
          state.spawnCalls.push({ node, args, spawnOptions })
          const child = new EventEmitter()
          child.exitCode = null
          child.kill = signal => {
            state.killSignals.push(signal)
            if (!(state.ignoreSigterm && signal === 'SIGTERM')) {
              process.nextTick(() => child.emit('exit', null))
            }
            return true
          }
          if (state.spawnError) {
            process.nextTick(() => child.emit('error', new Error('spawn failed')))
          } else if (state.interruptChild) {
            process.nextTick(() => state.processInfo.emit('SIGINT'))
          } else {
            process.nextTick(() => {
              child.exitCode = state.exitCode
              child.emit('exit', state.exitCode)
            })
          }
          return child
        }
      }
    }
    if (request === 'os') return { tmpdir: () => state.logDir }
    if (request === 'fs') return fakeFs
    if (request === 'process') return state.processInfo
    return originalLoad.call(this, request, parent, isMain)
  }
  console.log = () => {}
  delete require.cache[createLogPath]

  try {
    state.createLog = require(createLogPath)
  } finally {
    Module._load = originalLoad
    console.log = originalLog
  }
  return state
}

test('create-log creates missing log directory and spawns the requested script', async (t) => {
  t.plan(7)
  const state = loadCreateLog()
  const logPath = await state.createLog([ 'script.js', '--example' ], 'head', 'simple')

  t.assert.equal(logPath, `${state.logDir}/deoptigate/v8.log`, 'returns the v8 log path')
  t.assert.deepEqual(state.mkdirCalls, [ `${state.logDir}/deoptigate` ], 'creates a missing log directory')
  t.assert.deepEqual(state.spawnCalls[0].args.slice(-2), [ 'script.js', '--example' ], 'passes app arguments through')
  t.assert.equal(state.spawnCalls[0].args[0], '--log-ic', 'enables inline cache logging on supported Node')
  t.assert.equal(state.spawnCalls[0].args[1], '--log-deopt', 'enables deoptimization logging')
  const preloadIndex = state.spawnCalls[0].args.indexOf('-r')
  t.assert.equal(state.spawnCalls[0].args[preloadIndex + 1], path.join(__dirname, '../bin/soft-exit.js'), 'preloads the child SIGINT handler')
  t.assert.deepEqual(state.spawnCalls[0].spawnOptions.stdio, [ 'ignore', 'inherit', 'inherit' ], 'inherits child output')
})

test('create-log parses node flags, app args, and a custom Node executable', async (t) => {
  t.plan(7)
  const state = loadCreateLog({ exists: true, exitCode: null })
  const logPath = await state.createLog([
    'ignored-before-separator', '--', '/custom/node', '--allow-natives-syntax',
    'app.js', '--app-flag'
  ], 'head', 'simple')

  t.assert.equal(logPath, `${state.logDir}/deoptigate/v8.log`, 'returns the generated log path')
  t.assert.equal(state.mkdirCalls.length, 0, 'does not recreate an existing directory')
  t.assert.deepEqual(state.statCalls, [ `${state.logDir}/deoptigate` ], 'checks that existing log path is a directory')
  t.assert.equal(state.spawnCalls[0].node, '/custom/node', 'uses the requested Node executable')
  t.assert.deepEqual(state.spawnCalls[0].args.slice(-2), [ 'app.js', '--app-flag' ], 'passes only app arguments')
  t.assert.ok(state.spawnCalls[0].args.includes('--allow-natives-syntax'), 'passes Node flags')
  t.assert.ok(state.spawnCalls[0].args.indexOf('app.js') < state.spawnCalls[0].args.indexOf('--app-flag'), 'keeps app flags after the app path')
})

test('create-log supports the node executable and legacy IC flag', async (t) => {
  t.plan(4)
  const state = loadCreateLog({ nodeVersion: '15.0.0' })
  await state.createLog([ '--', 'node', '--trace-warnings', 'app.js' ], 'head', 'simple')
  t.assert.equal(state.spawnCalls[0].node, process.execPath, 'uses the default Node executable')
  t.assert.deepEqual(state.spawnCalls[0].args.slice(-1), [ 'app.js' ], 'passes app arguments after Node flags')
  t.assert.equal(state.spawnCalls[0].args[0], '--trace-ic', 'uses the legacy inline-cache flag')
  t.assert.ok(state.spawnCalls[0].args.includes('--trace-warnings'), 'passes Node flags through')
})

test('create-log rejects flags where a Node executable is required', async (t) => {
  t.plan(3)
  const state = loadCreateLog()
  let err
  try {
    await state.createLog([ '--', '--allow-natives-syntax', 'app.js' ], 'head', 'simple')
  } catch (error) {
    err = error
  }
  t.assert.match(err && err.message, /node binary must immediately follow/, 'rejects a flag instead of a Node executable')
  t.assert.equal(state.accessCalls.length, 0, 'validates arguments before touching the log directory')
  t.assert.equal(state.spawnCalls.length, 0, 'does not spawn on invalid arguments')
})

test('create-log rejects an existing path that is not a directory', async (t) => {
  t.plan(2)
  const state = loadCreateLog({ exists: true, isDirectory: false })
  let err
  try {
    await state.createLog([ 'app.js' ], 'head', 'simple')
  } catch (error) {
    err = error
  }
  t.assert.match(err && err.message, /wasn't a directory/, 'rejects a file at the log directory path')
  t.assert.equal(state.spawnCalls.length, 0, 'does not spawn when the log path is not a directory')
})

test('create-log handles a missing node executable argument after the separator', async (t) => {
  t.plan(2)
  const state = loadCreateLog()
  await state.createLog([ '--' ], 'head', 'simple')
  t.assert.equal(state.spawnCalls.length, 1, 'continues through the no-executable argument branch')
  t.assert.ok(!state.spawnCalls[0].args.includes(undefined), 'does not pass an undefined child argument')
})

test('create-log terminates the child when interrupted', async (t) => {
  t.plan(1)
  const state = loadCreateLog({ interruptChild: true })
  await state.createLog([ 'app.js' ], 'head', 'simple')
  t.assert.deepEqual(state.killSignals, [ 'SIGTERM' ], 'asks the child to exit gracefully on SIGINT')
})

test('create-log force kills a child that ignores SIGTERM', async (t) => {
  t.plan(1)
  const state = loadCreateLog({ interruptChild: true, ignoreSigterm: true })
  const keepAlive = setInterval(() => {}, 1000)
  try {
    await state.createLog([ 'app.js' ], 'head', 'simple')
  } finally {
    clearInterval(keepAlive)
  }
  t.assert.deepEqual(state.killSignals, [ 'SIGTERM', 'SIGKILL' ], 'forces exit after the grace period')
})

test('create-log rejects spawn errors and removes its signal handler', async (t) => {
  t.plan(2)
  const state = loadCreateLog({ spawnError: true })
  let err
  try {
    await state.createLog([ 'app.js' ], 'head', 'simple')
  } catch (error) {
    err = error
  }
  t.assert.equal(err && err.message, 'spawn failed', 'propagates the child spawn error')
  t.assert.equal(state.processInfo.listenerCount('SIGINT'), 0, 'cleans up the interrupt listener')
})
