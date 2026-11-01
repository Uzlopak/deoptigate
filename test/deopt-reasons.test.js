'use strict'

const fs = require('fs')
const path = require('path')
const test = require('tape')

const { processLogContent } = require('../deoptigate')
const DeoptEntry = require('../lib/log-processing/deopt-entry')

const repoRoot = path.join(__dirname, '..')
const sourceFile = path.join(repoRoot, 'examples/simple/adders.js')
const catalogPath = path.join(repoRoot, 'assets/deoptimization.md')

function readCatalogReasons() {
  const contents = fs.readFileSync(catalogPath, 'utf8').split('## Reading the examples')[0]
  const reasons = []
  for (const line of contents.split('\n')) {
    const match = /^\| `([^`]+)` \| ([^|]+) \|/.exec(line)
    if (match) reasons.push({ name: match[1], message: match[2].trim().replace(/^`(.*)`$/, '$1') })
  }
  return reasons
}

function v8CsvField(value) {
  return value.replace(/,/g, '\\x2c')
}

test('deoptigate preserves every catalogued V8 deoptimization reason', async (t) => {
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

  t.equal(reasons.length, 84, 'catalog contains 68 regular and 16 lazy reasons')
  t.equal(deopts.length, 1, 'all synthetic records map to the source location')
  t.equal(deopts[0].updates.length, reasons.length, 'all reason records were retained')

  const actualReasons = deopts[0].updates.map(update => update.deoptReason)
  t.deepEqual(actualReasons, reasons.map(reason => reason.message), 'reason messages are preserved in order')
  t.ok(deopts[0].updates.slice(0, 68).every(update => update.severity === 3), 'modern eager events get a visible severity')
  t.ok(deopts[0].updates.slice(68).every(update => update.severity === 2), 'dependency-change events get lazy severity')
  t.deepEqual(
    DeoptEntry.disassembleSourcePosition('<C:\\work\\app.js:12:8>'),
    { file: 'C:\\work\\app.js', line: 12, column: 8 },
    'Windows source paths with drive colons are parsed'
  )
  t.end()
})
