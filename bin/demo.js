'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const ClinicDeoptigate = require('../src')

function collect (profiler, args) {
  return new Promise((resolve, reject) => {
    profiler.collect(args, (err, dataPath) => {
      if (err) reject(err)
      else resolve(dataPath)
    })
  })
}

function visualize (profiler, dataPath, outputPath) {
  return new Promise((resolve, reject) => {
    profiler.visualize(dataPath, outputPath, err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

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
