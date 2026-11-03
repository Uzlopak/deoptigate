'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('node:test')

const { processLogContent } = require('../deoptigate')
const { processLog } = require('../deoptigate.log')

const repoRoot = path.join(__dirname, '..')
const sourceFile = path.join(repoRoot, 'examples/simple/adders.js')

/**
 * @param {string[]} lines
 * @returns {AsyncIterable<string>}
 */
async function * asAsyncIterable(lines) {
  yield * lines
}

/**
 * @param {unknown} value
 * @returns {value is {ics: {updates: unknown[]}[]}}
 */
function hasInlineCacheUpdates(value) {
  if (typeof value !== 'object' || value === null || !('ics' in value) || !Array.isArray(value.ics)) return false
  const firstEntry = value.ics[0]
  return typeof firstEntry === 'object' && firstEntry !== null && 'updates' in firstEntry && Array.isArray(firstEntry.updates)
}

/**
 * @param {string} contents
 * @returns {{ dir: string, logPath: string }}
 */
function writeTempLog(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deoptigate-parser-test-'))
  const logPath = path.join(dir, 'v8.log')
  fs.writeFileSync(logPath, contents)
  return { dir, logPath }
}

/** @param {{ dir: string, logPath: string }} temp */
function cleanupTempLog({ dir, logPath }) {
  fs.unlinkSync(logPath)
  fs.rmdirSync(dir)
}

test('legacy and timestamped IC records use their respective field offsets', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(15)
  const lines = [
    `code-creation,JS,9,1,0x1000,100,run ${sourceFile}:1:1,0x2000,~`,
    'LoadIC,0x1000,11,7,0,1,0x000abc,legacyKey',
    'StoreIC,0x1000,123456,12,8,1,P,0x000def,modernKey,,'
  ]

  const processor = await processLogContent(asAsyncIterable(lines), repoRoot)
  const ics = processor.toObject().ics
  t.assert.equal(ics.length, 2, 'both IC records are retained')

  const legacy = ics.find(x => x.updates[0].type === 'LoadIC')
  t.assert.ok(legacy, 'legacy record is identified')
  t.assert.equal(legacy.line, 11, 'legacy line is read from field 1')
  t.assert.equal(legacy.column, 7, 'legacy column is read from field 2')
  t.assert.equal(legacy.updates[0].oldState, 0, 'legacy old state is parsed')
  t.assert.equal(legacy.updates[0].newState, 2, 'legacy new state is parsed')
  t.assert.equal(legacy.updates[0].map, 'abc', 'legacy map is normalized')
  t.assert.equal(legacy.updates[0].key, 'legacyKey', 'legacy property key is retained')

  const modern = ics.find(x => x.updates[0].type === 'StoreIC')
  t.assert.ok(modern, 'timestamped record is identified')
  t.assert.equal(modern.line, 12, 'modern line skips the timestamp field')
  t.assert.equal(modern.column, 8, 'modern column skips the timestamp field')
  t.assert.equal(modern.updates[0].oldState, 2, 'modern old state is parsed')
  t.assert.equal(modern.updates[0].newState, 4, 'modern new state is parsed')
  t.assert.equal(modern.updates[0].map, 'def', 'modern map is normalized')
  t.assert.equal(modern.updates[0].key, 'modernKey', 'modern property key is retained')
})

test('V8 CSV decoding preserves escaped backslashes in source paths', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const line = 'code-creation,JS,9,1,0x1000,100,run C:\\\\work\\\\x5c.js:1:1,0x2000,~'
  const processor = await processLogContent(asAsyncIterable([ line ]), repoRoot)
  const code = processor.toObject().codes[0]

  t.assert.equal(code.functionName, 'run', 'function name is preserved')
  t.assert.equal(code.file, 'C:\\work\\x5c.js', 'decoded path retains each literal backslash')
})

test('processLog honors icStateChangesOnly for unchanged IC updates', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  const temp = writeTempLog([
    `code-creation,JS,9,1,0x1000,100,run ${sourceFile}:1:1,0x2000,~`,
    'LoadIC,0x1000,11,7,1,1,0x000abc,unchangedKey'
  ].join('\n') + '\n')

  try {
    const allUpdates = await processLog(temp.logPath, {
      root: repoRoot,
      icStateChangesOnly: false
    })
    const changesOnly = await processLog(temp.logPath, {
      root: repoRoot,
      icStateChangesOnly: true
    })

    const fullFile = allUpdates.get(sourceFile)
    const filteredFile = changesOnly.get(sourceFile)
    t.assert.ok(fullFile, 'source file resolves when unchanged IC data is retained')
    if (!hasInlineCacheUpdates(fullFile)) throw new Error('Expected inline-cache update data')
    t.assert.equal(fullFile.ics[0].updates.length, 1, 'false retains the unchanged update')
    t.assert.ok(filteredFile, 'code data keeps the file group after filtering')
    t.assert.equal(filteredFile.ics.length, 0, 'true filters the unchanged update')
  } finally {
    cleanupTempLog(temp)
  }
})

test('malformed deopt source positions do not abort log processing', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const temp = writeTempLog([
    `code-creation,JS,9,1,0x1000,100,run ${sourceFile}:1:1,0x2000,~`,
    'code-deopt,1,100,0x1000,-1,12,deopt-eager,malformed,unknown position'
  ].join('\n') + '\n')

  try {
    const grouped = await processLog(temp.logPath, { root: repoRoot })
    const file = grouped.get(sourceFile)
    t.assert.ok(file, 'valid code entry remains available')
    t.assert.equal(file.deopts.length, 0, 'deopt without a source file is omitted from file groups')
  } finally {
    cleanupTempLog(temp)
  }
})

test('parser reports a malformed IC row and continues with following records', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  const processor = await processLogContent(asAsyncIterable([]), repoRoot)
  /** @type {string[]} */
  const errors = []
  const originalTrace = console.trace
  const originalError = console.error
  processor._silentErrors = false
  console.trace = () => {}
  console.error = message => errors.push(message)

  try {
    processor.processString([
      `code-creation,JS,9,1,0x1000,100,run ${sourceFile}:1:1,0x2000,~`,
      'LoadIC,0x1000,11,7,?,1,0x000abc,badState',
      'StoreIC,0x1000,12,8,0,1,0x000def,validKey'
    ].join('\n') + '\n')
  } finally {
    console.trace = originalTrace
    console.error = originalError
  }

  const ics = processor.toObject().ics
  t.assert.equal(errors.length, 1, 'the malformed row is sent through printError')
  t.assert.match(errors[0], /unknown ic code state/, 'parser error identifies the invalid IC state')
  const validEntry = ics.find(x => x.updates.length > 0)
  t.assert.ok(validEntry, 'the following valid IC row is processed')
  t.assert.equal(validEntry.updates[0].key, 'validKey', 'the valid record survives after the bad row')
})
