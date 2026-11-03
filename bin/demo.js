'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const ClinicDeoptigate = require('../src')

/**
 * Collect a profile using the provided ClinicDeoptigate instance.
 * @param {InstanceType<typeof ClinicDeoptigate>} profiler
 * @param {string[]} args Node executable followed by the script and its arguments.
 * @returns {Promise<string>} Path to the captured profile directory.
 */
function collect (profiler, args) {
  return new Promise((resolve, reject) => {
    profiler.collect(args, (err, dataPath) => {
      if (err) reject(err)
      else resolve(/** @type {string} */ (dataPath))
    })
  })
}

/**
 * Generate a report for a captured profile.
 * @param {InstanceType<typeof ClinicDeoptigate>} profiler
 * @param {string} dataPath Profile directory.
 * @param {string} outputPath Destination HTML path.
 * @returns {Promise<void>}
 */
function visualize (profiler, dataPath, outputPath) {
  return new Promise((resolve, reject) => {
    profiler.visualize(dataPath, outputPath, err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/** @returns {Promise<void>} */
async function main () {
  const reportDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'deoptigate-demo-'))
  const captureDir = path.join(reportDir, 'capture')
  const reportPath = path.join(reportDir, 'clinic-deoptigate.html')
  let reportCreated = false
  try {
    await fs.promises.mkdir(captureDir)
    const workloadPath = path.join(__dirname, '..', 'examples', 'demo-workload.js')
    const profiler = new ClinicDeoptigate({
      dest: captureDir,
      name: 'demo',
      root: path.dirname(workloadPath)
    })
    const dataPath = await collect(profiler, [process.execPath, workloadPath])
    await visualize(profiler, dataPath, reportPath)
    reportCreated = true
    process.stdout.write(`Deoptigate report written to ${reportPath}\n`)
  } finally {
    await fs.promises.rm(captureDir, { recursive: true, force: true })
    if (!reportCreated) await fs.promises.rm(reportDir, { recursive: true, force: true })
  }
}

main().catch(err => {
  process.stderr.write(`${err.stack || err.message}\n`)
  process.exitCode = 1
})
