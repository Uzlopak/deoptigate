'use strict'

const { spawn } = require('child_process')
const { tmpdir } = require('os')
const fs = require('fs')
const { promisify } = require('util')
const chmod = promisify(fs.chmod)
const mkdir = promisify(fs.mkdir)
const stat = promisify(fs.stat)
const unlink = promisify(fs.unlink)
const processInfo = require('process')
const softExitPreload = require.resolve('./soft-exit')

const { brightBlack } = require('./ansi')

const NODE_OPTIONS_WITH_VALUES = new Set([
  '-r',
  '-e',
  '-p',
  '-pe',
  '--eval',
  '--print',
  '--require',
  '--import',
  '--loader',
  '--experimental-loader',
  '-C',
  '--conditions',
  '--env-file',
  '--env-file-if-exists',
  '--icu-data-dir',
  '--inspect-port',
  '--max-http-header-size',
  '--redirect-warnings',
  '--diagnostic-dir',
  '--title',
  '--input-type',
  '--disable-warning',
  '--stack-trace-limit',
  '--trace-event-categories',
  '--trace-event-file-pattern',
  '--unhandled-rejections',
  '--watch-path',
  '--cpu-prof-dir',
  '--cpu-prof-interval',
  '--heap-prof-dir',
  '--heap-prof-interval',
  '--test-name-pattern',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-shard',
  '--test-timeout'
])

/**
 * Split Deoptigate arguments from the Node executable and its arguments.
 * @param {string[]} args Command-line arguments after the CLI name.
 * @returns {{argv: string[], extraExecArgv: string[], nodeExecutable?: string}}
 */
function determineArgs (args) {
  // Only a leading separator is ours; a later one belongs to the application.
  if (args[0] !== '--') {
    return { argv: args, extraExecArgv: [] }
  }
  const afterDashes = args.slice(1)

  const first = afterDashes[0]
  if (first == null) return { argv: [], extraExecArgv: [] }

  if (first[0] === '-') {
    throw Error(
      `The node binary must immediately follow the double dash (--)
  deoptigate -- node [nodeFlags] script.js [scriptFlags]
    `)
  }
  const afterDashesArgs = afterDashes.slice(1)

  // Piece together Node flags and app arguments in cases as
  // deoptigate -- node --allow-natives-syntax app.js --log
  // to be: [ --allow-natives-syntax ] and [ app.js, --log ]
  const extraExecArgv = []
  const argv = []
  let sawApp = false

  for (let index = 0; index < afterDashesArgs.length; index++) {
    const arg = afterDashesArgs[index]
    if (sawApp) {
      argv.push(arg)
      continue
    }
    if (NODE_OPTIONS_WITH_VALUES.has(arg)) {
      const value = afterDashesArgs[index + 1]
      if (value == null) throw Error(`Node flag ${arg} requires a value.`)
      extraExecArgv.push(arg, value)
      index++
      continue
    }
    if (!arg.startsWith('-')) {
      sawApp = true
      argv.push(arg)
      continue
    }
    extraExecArgv.push(arg)
  }

  return (
    first === 'node'
      ? { argv, extraExecArgv }
      : { argv, extraExecArgv, nodeExecutable: first }
  )
}

/**
 * Run the requested Node.js program with V8 logging enabled.
 * @param {string[]} args Command-line arguments after the CLI name.
 * @param {string} head Message prefix for the process status.
 * @param {string} simpleHead Message prefix for the log file path.
 * @returns {Promise<string>} Path to the generated V8 log.
 */
async function createLog (args, head, simpleHead) {
  const { extraExecArgv, argv, nodeExecutable } = determineArgs(args)

  const logDir = `${tmpdir()}/deoptigate`
  try {
    const statInfo = await stat(logDir)
    if (!statInfo.isDirectory()) {
      throw new Error(`Found ${logDir}, but it wasn't a directory, please remove it.`)
    }
  } catch (err) {
    if (!(err instanceof Error) || !('code' in err) || err.code !== 'ENOENT') throw err
    await mkdir(logDir, { recursive: true, mode: 0o700 })
  }
  await chmod(logDir, 0o700)

  const logFile = `${tmpdir()}/deoptigate/v8.log`
  // A run that never starts must not report the previous run's log.
  try {
    await unlink(logFile)
  } catch (err) {
    if (!(err instanceof Error) || !('code' in err) || err.code !== 'ENOENT') throw err
  }
  const nodeMajorVersion = Number(processInfo.versions.node.split('.')[0])
  const inlineCacheArg = nodeMajorVersion > 15 ? '--log-ic' : '--trace-ic'

  const execArgv = [
    inlineCacheArg,
    '--log-deopt',
    // V8 expands % in this path, and %% is its escape for a literal %.
     `--logfile=${logFile.replace(/%/g, '%%')}`,
     '--no-logfile-per-isolate'
  ].concat(extraExecArgv)

  const child = spawn(
    nodeExecutable || processInfo.execPath,
    execArgv.concat(['-r', softExitPreload], argv),
    { stdio: ['ignore', 'inherit', 'inherit'] }
  )
  const code = await new Promise((resolve, reject) => {
    /** @type {NodeJS.Timeout | undefined} */
    let killTimer
    const cleanup = () => {
      processInfo.removeListener('SIGINT', handleInterrupt)
      clearTimeout(killTimer)
    }
    const handleInterrupt = () => {
      child.kill('SIGTERM')
      killTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      }, 500)
      killTimer.unref()
    }

    processInfo.once('SIGINT', handleInterrupt)
    child.once('error', err => {
      cleanup()
      reject(err)
    })
    child.once('exit', exitCode => {
      cleanup()
      resolve(exitCode)
    })
  })
  const terminationMsg = (code == null
    ? 'process was interrupted'
    : 'process completed with code ' + code
  )
  if (code !== 0) processInfo.exitCode = code ?? 1
  console.log(`\n${head} ${brightBlack(terminationMsg)}`)
  console.log(`${simpleHead} ${brightBlack('logfile written to ' + logFile)}`)
  return logFile
}

module.exports = createLog
