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
const activeCollectionPaths = new Set()

/**
 * @param {string} filename
 * @returns {Promise<void>}
 */
function removeIfPresent (filename) {
  return fs.promises.unlink(filename).catch(err => {
    if (err.code !== 'ENOENT') throw err
  })
}

/**
 * @typedef {object} ClinicDeoptigateSettings
 * @property {string} [dest='.clinic'] Directory for profile data.
 * @property {string} [name] Name used for the profile directory.
 * @property {string} [root] Root used to resolve source files.
 * @property {boolean} [collectOnFailure=false] Keep profile data after a nonzero exit.
 * @property {boolean} [detectPort=false] Detect the first TCP listening port.
 */

/**
 * Collects V8 deoptimization data and generates a standalone report.
 * @extends {EventEmitter}
 */
class ClinicDeoptigate extends EventEmitter {
  /**
   * @param {ClinicDeoptigateSettings} [settings]
   */
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
    /** @type {import('child_process').ChildProcess | null} */
    this.process = null
    /** @type {number | undefined} */
    this.elapsedTime = undefined
  }

  /**
   * Run a Node.js process with V8 deoptimization logging enabled.
   * @param {string[]} args Node executable followed by the script and its arguments.
   * @param {(err: Error | null, dataPath?: string) => void} callback
   * @returns {void}
   */
  collect (args, callback) {
    if (!Array.isArray(args) || args.length < 2) {
      callback(new Error('expected Node.js executable and script arguments'))
      return
    }

    const [nodeExecutable, ...scriptArgs] = args
    const outputDir = path.join(this.path, `${this.name || process.pid}.clinic-deoptigate`)
    const absoluteOutputDir = path.resolve(outputDir)
    if (activeCollectionPaths.has(absoluteOutputDir)) {
      callback(new Error(`A collection is already active for ${absoluteOutputDir}.`))
      return
    }
    activeCollectionPaths.add(absoluteOutputDir)
    const logFile = path.join(absoluteOutputDir, 'v8.log')
    const metadataFile = path.join(absoluteOutputDir, 'deoptigate.json')

    fs.promises.mkdir(outputDir, { recursive: true })
      .then(() => removeIfPresent(logFile))
      .then(() => fs.promises.writeFile(metadataFile, JSON.stringify({
        root: this.root || process.cwd()
      })))
      .then(() => {
        let completed = false
        /** @type {import('child_process').ChildProcess | null} */
        let child = null
        /** @type {import('net').Server | null} */
        let portServer = null
        /**
         * @param {Error | null} err
         * @param {string} [result]
         */
        const finish = (err, result) => {
          if (completed) return
          completed = true
          activeCollectionPaths.delete(absoluteOutputDir)
          if (portServer && portServer.listening) portServer.close()
          callback(err, result)
        }

        /** @param {number} [port] */
        const startChild = port => {
          const childArgs = [
            '--log-ic',
            '--log-deopt',
            // V8 expands % in this path, and %% is its escape for a literal %.
            `--logfile=${logFile.replace(/%/g, '%%')}`,
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

        const server = createServer(socket => {
          socket.once('data', data => {
            const port = Number(data.toString())
            if (!Number.isInteger(port) || port < 1 || port > 65535) return
            server.close()
            portServer = null
            this.emit('port', port, child, this.stopViaIPC.bind(this))
          })
        })
        portServer = server
        server.once('error', finish)
        server.listen(0, '127.0.0.1', () => {
          const address = server.address()
          if (address && typeof address !== 'string') {
            try {
              startChild(address.port)
            } catch (err) {
              finish(/** @type {Error} */ (err))
            }
          }
        })
      })
      .catch(err => {
        activeCollectionPaths.delete(absoluteOutputDir)
        callback(err)
      })
  }

  /**
   * Generate an HTML report from a profile directory or V8 log file.
   * @param {string} source Profile directory or path to `v8.log`.
   * @param {string} outputFilename Destination HTML file.
   * @param {(err: Error | null) => void} callback
   * @returns {void}
   */
  visualize (source, outputFilename, callback) {
    const run = async () => {
      const sourceStat = await fs.promises.stat(source)
      const outputDir = sourceStat.isDirectory() ? source : path.dirname(source)
      const logFile = sourceStat.isDirectory() ? path.join(source, 'v8.log') : source
      let root = this.root || process.cwd()
      /** @type {string | undefined} */
      let elapsedTime

      try {
        const metadata = JSON.parse(await fs.promises.readFile(
          path.join(outputDir, 'deoptigate.json'), 'utf8'
        ))
        if (metadata.root) root = metadata.root
        if (Number.isFinite(metadata.elapsedTime)) elapsedTime = `${metadata.elapsedTime.toFixed(2)}s`
      } catch (err) {
        const fileError = /** @type {NodeJS.ErrnoException} */ (err)
        if (fileError.code !== 'ENOENT') throw err
      }

      const data = Array.from(await processLog(logFile, { root }))
      /** @type {Promise<void>} */
      const pageWritten = new Promise((resolve, reject) => {
        pipeline(
          createClinicPage(data, require('../package.json').version, elapsedTime),
          fs.createWriteStream(outputFilename),
          err => err ? reject(err) : resolve()
        )
      })
      await pageWritten
    }

    run().then(() => callback(null), callback)
  }

  /** Stop the profiled process with SIGINT, if it is still running. */
  stopViaIPC () {
    if (this.process && this.process.exitCode == null) {
      this.process.kill('SIGINT')
    }
  }
}

ClinicDeoptigate.lookupDeoptimizationReason = lookupDeoptimizationReason
ClinicDeoptigate.getMcpTools = getMcpTools

module.exports = ClinicDeoptigate
