'use strict'

const escapeRegex = require('escape-string-regexp')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('node:test')
const util = require('util')
const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const WINDOWS_LINE_ENDINGS_RX = /\r\n/g
const V8_LOG_SUFFIX_RX = /\.v8\.log$/

const { deoptigateLog } = require('../deoptigate.log')

/**
 * @typedef {{file: string, updates: {bailoutType?: string, map?: string}[]}} TestLogEntry
 * @typedef {{fullPath: string, relativePath: string, src: string, ics: Map<string, TestLogEntry>, deopts: Map<string, TestLogEntry>, codes: Map<string, TestLogEntry>, icLocations: string[], deoptLocations: string[]}} TestFileData
 */

/**
 * @param {unknown} value
 * @returns {value is TestLogEntry}
 */
function isTestLogEntry(value) {
  return value != null && typeof value === 'object' &&
    'file' in value && typeof value.file === 'string' &&
    'updates' in value && Array.isArray(value.updates)
}

/**
 * @param {unknown} value
 * @returns {value is TestFileData}
 */
function isTestFileData(value) {
  return value != null && typeof value === 'object' &&
    'fullPath' in value && typeof value.fullPath === 'string' &&
    'relativePath' in value && typeof value.relativePath === 'string' &&
    'src' in value && typeof value.src === 'string' &&
    'ics' in value && value.ics instanceof Map && Array.from(value.ics.values()).every(isTestLogEntry) &&
    'deopts' in value && value.deopts instanceof Map && Array.from(value.deopts.values()).every(isTestLogEntry) &&
    'codes' in value && value.codes instanceof Map && Array.from(value.codes.values()).every(isTestLogEntry) &&
    'icLocations' in value && Array.isArray(value.icLocations) &&
    'deoptLocations' in value && Array.isArray(value.deoptLocations)
}

/**
 * @param {...string} args
 * @returns {string}
 */
function repoRoot(...args) {
  return path.join(__dirname, '..', ...args)
}

/**
 * Replace the temporary paths to source files with the real path
 * to the source files
 * @param {string} srcLog The path to the log file to prepare
 * @param {Array<[string, string]>} replacements An array of [template, realPath]
 * @param {string} destDir
 * @returns {Promise<string>}
 */
async function prepareLogFile(srcLog, replacements, destDir) {
  let contents = await readFile(srcLog, 'utf8')

  // Windows + Git shenanigans
  contents = contents.replace(WINDOWS_LINE_ENDINGS_RX, '\n');
  for (const [template, realPath] of replacements) {
    contents = contents.replace(
      new RegExp(escapeRegex(template), 'g'),
      realPath
    )
  }

  const destLog = path.join(destDir, path.basename(srcLog).replace(V8_LOG_SUFFIX_RX, '.prepared.v8.log'))
  await writeFile(destLog, contents, 'utf8')
  return destLog
}

/**
 * @template T
 * @param {string} srcLog
 * @param {Array<[string, string]>} replacements
 * @param {(preparedLogPath: string) => Promise<T>} run
 * @returns {Promise<T>}
 */
async function withPreparedLog(srcLog, replacements, run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deoptigate-prepared-log-'))
  const destLog = path.join(tempDir, path.basename(srcLog).replace(V8_LOG_SUFFIX_RX, '.prepared.v8.log'))
  try {
    await prepareLogFile(srcLog, replacements, tempDir)
    return await run(destLog)
  } finally {
    if (fs.existsSync(destLog)) fs.unlinkSync(destLog)
    fs.rmdirSync(tempDir)
  }
}

test('adders.v8.log', async (t) => {
  t.plan(9)

  /** @type {Array<[string, string]>} */
  const replacements = [
    [
      '/tmp/deoptigate/examples/simple/adders.js',
      repoRoot('examples/simple/adders.js'),
    ],
  ]
  const addersSrcFile = replacements[0][1]
  const srcLogPath = path.join(__dirname, 'logs', 'adders.v8.log')
  await withPreparedLog(srcLogPath, replacements, async destLogPath => {
    const result = await deoptigateLog(destLogPath)
    t.assert.equal(result.size, 1, 'number of files')

    const fileData = result.get(addersSrcFile)
    if (!isTestFileData(fileData)) throw new Error(`Expected complete file data for ${addersSrcFile}`)
    const fileSrc = await readFile(addersSrcFile, 'utf8')
    t.assert.equal(fileData.fullPath, addersSrcFile, 'fullPath')
    t.assert.equal(fileData.ics.size, 33, 'number of ics')
    t.assert.equal(fileData.deopts.size, 7, 'number of deopts')
    t.assert.equal(fileData.codes.size, 16, 'number of codes')
    t.assert.equal(fileData.src, fileSrc, 'file source')

    const deoptLocation = fileData.deoptLocations[0]
    t.assert.equal(deoptLocation, 'addAny:93:27', 'first deoptLocation')

    const deoptData = fileData.deopts.get(deoptLocation)
    if (!isTestLogEntry(deoptData)) throw new Error(`Expected deoptimization data for ${deoptLocation}`)
    t.assert.equal(deoptData.file, addersSrcFile, 'deopt file path')

    const updateData = deoptData.updates[2]
    t.assert.equal(updateData.bailoutType, 'eager', 'deopt update bailout type')
  })
})

test('two-modules.v8.log', async (t) => {
  t.plan(9)

  /** @type {Array<[string, string]>} */
  const replacements = [
    [
      '/tmp/deoptigate/examples/two-modules/adders.js',
      repoRoot('examples/two-modules/adders.js'),
    ],
    [
      '/tmp/deoptigate/examples/two-modules/objects.js',
      repoRoot('examples/two-modules/objects.js'),
    ],
  ]

  const srcFile = replacements[1][1]
  const srcLogPath = path.join(__dirname, 'logs', 'two-modules.v8.log')
  await withPreparedLog(srcLogPath, replacements, async destLogPath => {
    const result = await deoptigateLog(destLogPath)
    t.assert.equal(result.size, 2, 'number of files')

    const fileData = result.get(srcFile)
    if (!isTestFileData(fileData)) throw new Error(`Expected complete file data for ${srcFile}`)
    const fileSrc = await readFile(srcFile, 'utf8')
    t.assert.equal(fileData.fullPath, srcFile, 'fullPath')
    t.assert.equal(fileData.ics.size, 25, 'number of ics')
    t.assert.equal(fileData.deopts.size, 0, 'number of deopts')
    t.assert.equal(fileData.codes.size, 8, 'number of codes')
    t.assert.equal(fileData.src, fileSrc, 'file source')

    const icLocation = fileData.icLocations[0]
    t.assert.equal(icLocation, 'Object1:3:12', 'first icLocation')

    const icData = fileData.ics.get(icLocation)
    if (!isTestLogEntry(icData)) throw new Error(`Expected inline-cache data for ${icLocation}`)
    t.assert.equal(icData.file, srcFile, 'ics file path')

    const updateData = icData.updates[0]
    t.assert.equal(updateData.map, '37cdf3b7a811', 'ics update map')
  })
})
