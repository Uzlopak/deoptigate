'use strict'

const fs = require('fs')
const path = require('path')
const { test } = require('node:test')

const { processLogContent } = require('../deoptigate')
const DeoptEntry = require('../lib/log-processing/deopt-entry')

const repoRoot = path.join(__dirname, '..')
const sourceFile = path.join(repoRoot, 'examples/simple/adders.js')
const catalogPath = path.join(repoRoot, 'assets/deoptimization.md')
const CATALOG_REASON_LINE_RX = /^\| `([^`]+)` \| ([^|]+) \|/
const BACKTICK_EDGE_RX = /^`(.*)`$/
const CSV_COMMA_RX = /,/g

function readCatalogReasons() {
  const contents = fs.readFileSync(catalogPath, 'utf8').split('## Reading the examples')[0]
  const reasons = []
  for (const line of contents.split('\n')) {
    const match = CATALOG_REASON_LINE_RX.exec(line)
    if (match) reasons.push({ name: match[1], message: match[2].trim().replace(BACKTICK_EDGE_RX, '$1') })
  }
  return reasons
}

function v8CsvField(value) {
  return value.replace(CSV_COMMA_RX, '\\x2c')
}

test('deoptigate retains every supplied catalog deoptimization message', async (t) => {
  t.plan(7)
  const reasons = readCatalogReasons()
  const start = '0x1000'
  const func = '0x2000'
  const location = `${sourceFile}:90:1`
  const lines = [
    `code-creation,JS,9,1,${start},100,run ${location},${func},~`,
    `code-creation,JS,12,2,0x3000,100,run ${location},${func},*`
  ]

  for (let i = 0; i < reasons.length; i++) {
    const reason = reasons[i]
    lines.push(
      `code-deopt,${i + 1},100,0x3000,-1,12,${i < 68 ? 'deopt-eager' : 'dependency-change'},<${sourceFile}:90:3>,${v8CsvField(reason.message)}`
    )
  }

  const processed = await processLogContent(lines, repoRoot)
  const deopts = processed.toObject().deopts

  t.assert.equal(reasons.length, 84, 'catalog contains 68 regular and 16 lazy reasons')
  t.assert.equal(deopts.length, 1, 'all synthetic records map to the source location')
  t.assert.equal(deopts[0].updates.length, reasons.length, 'all reason records were retained')

  const actualReasons = deopts[0].updates.map(update => update.deoptReason)
  t.assert.deepEqual(actualReasons, reasons.map(reason => reason.message), 'supplied messages are preserved in order')
  t.assert.ok(deopts[0].updates.slice(0, 68).every(update => update.severity === 3), 'modern eager events get a visible severity')
  t.assert.ok(deopts[0].updates.slice(68).every(update => update.severity === 2), 'dependency-change events get lazy severity')
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition('<C:\\work\\app.js:12:8>'),
    { file: 'C:\\work\\app.js', line: 12, column: 8 },
    'Windows source paths with drive colons are parsed'
  )
})

test('processor parses complete strings and serializes its output as JSON', async (t) => {
  t.plan(3)
  const processor = await processLogContent([], repoRoot)
  const lines = [
    `code-creation,JS,9,1,0x1000,100,run ${sourceFile}:1:1,0x2000,~`,
    'sfi-move,0x2000,0x4000',
    `code-creation,JS,12,2,0x3000,100,run ${sourceFile}:1:1,0x4000,*`
  ]

  // The final unterminated fragment is ignored by processString.
  processor.processString(lines.join('\n') + '\nignored trailing fragment')

  const output = JSON.parse(processor.toJSON())
  t.assert.equal(output.root, repoRoot, 'JSON output includes the configured root')
  t.assert.equal(output.codes.length, 1, 'code creations at the same location are grouped')
  t.assert.equal(output.codes[0].updates.length, 2, 'both code state updates are serialized')
})

test('sfi-move updates the function identity associated with existing code', async (t) => {
  t.plan(2)
  const processor = await processLogContent([], repoRoot)
  processor.processString([
    `code-creation,JS,9,1,0x1000,100,before ${sourceFile}:1:1,0x2000,~`,
    'sfi-move,0x2000,0x4000',
    `code-creation,JS,12,2,0x3000,100,after ${sourceFile}:2:1,0x4000,*`,
    `code-deopt,3,100,0x1000,-1,12,deopt-eager,<${sourceFile}:3:1>,after move`
  ].join('\n') + '\n')

  const deopts = processor.toObject().deopts
  t.assert.equal(deopts.length, 1, 'deopt record for the original code is retained')
  t.assert.equal(deopts[0].functionName, 'after', 'the old code resolves through the moved function entry')
})
