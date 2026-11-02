'use strict'

const { spawn } = require('child_process')
const EventEmitter = require('events')
const fs = require('fs')
const { createServer } = require('net')
const path = require('path')
const { pipeline } = require('stream')

const { processLog } = require('../deoptigate.log')
const createClinicPage = require('./clinic-page')
const lookupDeoptimizationReason = require('./deoptimization-lookup')
const getMcpTools = require('./mcp-tools')
const softExitPreload = require.resolve('./injects/soft-exit')

function removeIfPresent (filename) {
  return fs.promises.unlink(filename).catch(err => {
    if (err.code !== 'ENOENT') throw err
  })
}

class ClinicDeoptigate extends EventEmitter {
  constructor (settings = {}) {
    super()

    const {
      dest = '.clinic',
      name,
      root,
      collectOnFailure = false,
      detectPort = false
    } = settings
    this.path = dest
    this.name = name
    this.root = root
    this.collectOnFailure = !!collectOnFailure
    this.detectPort = !!detectPort
    this.process = null
  }

  collect (args, callback) {
    if (!Array.isArray(args) || args.length < 2) {
      callback(new Error('expected Node.js executable and script arguments'))
      return
    }

    const [nodeExecutable, ...scriptArgs] = args
    const outputDir = path.join(this.path, `${this.name || process.pid}.clinic-deoptigate`)
    const absoluteOutputDir = path.resolve(outputDir)
    const logFile = path.join(absoluteOutputDir, 'v8.log')
    const metadataFile = path.join(absoluteOutputDir, 'deoptigate.json')

    fs.promises.mkdir(outputDir, { recursive: true })
      .then(() => removeIfPresent(logFile))
      .then(() => fs.promises.writeFile(metadataFile, JSON.stringify({
        root: this.root || process.cwd()
      })))
      .then(() => {
        let completed = false
        let child
        let portServer
        const finish = (err, result) => {
          if (completed) return
          completed = true
          if (portServer && portServer.listening) portServer.close()
          callback(err, result)
        }

        const startChild = port => {
          const childArgs = [
            '--log-ic',
            '--log-deopt',
            `--logfile=${logFile}`,
            '--no-logfile-per-isolate',
            '-r',
            softExitPreload
          ]
          const env = { ...process.env }
          if (port != null) {
            childArgs.push('-r', require.resolve('./injects/detect-port'))
            env.CLINIC_DEOPTIGATE_PORT = String(port)
          }
          childArgs.push(...scriptArgs)
          const startedAt = Date.now()
          child = spawn(nodeExecutable, childArgs, {
            stdio: ['ignore', 'inherit', 'inherit'],
            env
          })
          this.process = child

          child.once('error', finish)
          child.once('exit', (code, signal) => {
            this.elapsedTime = (Date.now() - startedAt) / 1000
            fs.promises.writeFile(metadataFile, JSON.stringify({
              root: this.root || process.cwd(),
              elapsedTime: this.elapsedTime
            })).then(() => {
              this.emit('analysing')
              if (code !== 0 && !this.collectOnFailure) {
                finish(new Error(signal
                  ? `Profiled process exited with signal ${signal}.`
                  : `Profiled process exited with code ${code}.`
                ))
                return
              }
              finish(null, outputDir)
            }, finish)
          })
        }

        if (!this.detectPort) {
          startChild()
          return
        }

        portServer = createServer(socket => {
          socket.once('data', data => {
            const port = Number(data.toString())
            if (!Number.isInteger(port) || port < 1 || port > 65535) return
            portServer.close()
            portServer = null
            this.emit('port', port, child, this.stopViaIPC.bind(this))
          })
        })
        portServer.once('error', finish)
        portServer.listen(0, '127.0.0.1', () => startChild(portServer.address().port))
      })
      .catch(callback)
  }

  visualize (source, outputFilename, callback) {
    const run = async () => {
      const sourceStat = await fs.promises.stat(source)
      const outputDir = sourceStat.isDirectory() ? source : path.dirname(source)
      const logFile = sourceStat.isDirectory() ? path.join(source, 'v8.log') : source
      let root = this.root || process.cwd()
      let elapsedTime

      try {
        const metadata = JSON.parse(await fs.promises.readFile(
          path.join(outputDir, 'deoptigate.json'), 'utf8'
        ))
        if (metadata.root) root = metadata.root
        if (Number.isFinite(metadata.elapsedTime)) elapsedTime = `${metadata.elapsedTime.toFixed(2)}s`
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }

      const data = Array.from(await processLog(logFile, { root }))
      await new Promise((resolve, reject) => {
        pipeline(
          createClinicPage(data, require('../package.json').version, elapsedTime),
          fs.createWriteStream(outputFilename),
          err => err ? reject(err) : resolve()
        )
      })
    }

    run().then(() => callback(null), callback)
  }

  stopViaIPC () {
    if (this.process && this.process.exitCode == null) {
      this.process.kill('SIGINT')
    }
  }
}

ClinicDeoptigate.lookupDeoptimizationReason = lookupDeoptimizationReason
ClinicDeoptigate.getMcpTools = getMcpTools

module.exports = ClinicDeoptigate
