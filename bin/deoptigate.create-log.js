'use strict'

const { spawn } = require('ispawn')
const { tmpdir } = require('os')
const fs = require('fs')
const { promisify } = require('util')
const mkdir = promisify(fs.mkdir)
const stat = promisify(fs.stat)
const processInfo = require('process')

const { brightBlack } = require('./ansi')

function determineArgs(args) {
  const __index = args.indexOf('--')
  if (__index < 0) {
    return { argv: args, extraExecArgv: [] }
  }
  // For now we ignore any args before the -- as those would be for deoptigate
  // At this point deoptigate doesn't consume any flags
  const afterDashes = args.slice(__index + 1)

  const first = afterDashes[0]
  if (first == null) return { execArgv: [] }

  if (first[0] === '-') {
    throw Error(
      `The node binary must immediately follow the double dash (--)
  deoptigate -- node [nodeFlags] script.js [scriptFlags]
    `)
  }
  const afterDashesArgs = afterDashes.slice(1)

  // Piece together execArgv and argv in cases as
  // deoptigate -- node --allow-natives-syntax app.js --log
  // to be: [ --allow-natives-syntax ] and [ app.js, --log ]
  // Not super important as ispawn concatentates them anyways, but for correctness
  const extraExecArgv = []
  const argv = []
  let sawApp = false

  for (const arg of afterDashesArgs) {
    if (sawApp) {
      argv.push(arg)
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

async function createLog(args, head, simpleHead) {
  const { extraExecArgv, argv,  nodeExecutable } = determineArgs(args)

  const logDir = `${tmpdir()}/deoptigate`
  try {
    const statInfo = await stat(logDir)
    if (!statInfo.isDirectory()) {
      throw new Error(`Found ${logDir}, but it wasn't a directory, please remove it.`)
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    await mkdir(logDir, { recursive: true })
  }

  const logFile = `${tmpdir()}/deoptigate/v8.log`
  const nodeMajorVersion = Number(processInfo.versions.node.split('.')[0])
  const inlineCacheArg = nodeMajorVersion > 15 ? '--log-ic' : '--trace-ic'

  const execArgv = [
      inlineCacheArg
    , '--log-deopt'
    , `--logfile=${logFile}`
    , '--no-logfile-per-isolate'
  ].concat(extraExecArgv)

  const spawnArgs = { execArgv, argv }
  if (nodeExecutable != null) spawnArgs.node = nodeExecutable

  const { termination } = spawn(spawnArgs)
  const code = await termination
  const terminationMsg = (code == null
    ? 'process was interrupted'
    : 'process completed with code ' + code
  )
  console.log(`\n${head} ${brightBlack(terminationMsg)}`)
  console.log(`${simpleHead} ${brightBlack('logfile written to ' + logFile)}`)
  return logFile
}

module.exports = createLog
