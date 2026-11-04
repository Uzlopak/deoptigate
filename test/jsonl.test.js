'use strict'

const { test } = require('node:test')
const toJsonl = require('../lib/jsonl')

test('JSONL keeps readable event details without source or repeated file paths', (
  /** @type {import('node:test').TestContext} */ t
) => {
  t.plan(9)
  const fullPath = '/project/src/app.js'
  const report = new Map([[fullPath, {
    fullPath,
    relativePath: 'src/app.js',
    src: 'function run () { /* large source omitted */ }',
    ics: [{
      functionName: 'run',
      file: fullPath,
      line: 2,
      column: 3,
      updates: [{ type: 'LoadIC', oldState: 1, newState: 2, key: 'value', map: '0x123', optimizationState: 1, severity: 2 }]
    }],
    deopts: [{
      functionName: 'run',
      file: fullPath,
      line: 2,
      column: 8,
      updates: [{ timestamp: 1234, bailoutType: 'eager', deoptReason: 'wrong map', optimizationState: 2, inlined: false, severity: 3 }]
    }],
    codes: [{
      functionName: 'run',
      file: fullPath,
      line: 1,
      column: 1,
      isScript: true,
      updates: [{ timestamp: 1000, state: 2, severity: 3 }]
    }]
  }]])

  const jsonl = toJsonl(report)
  const lines = jsonl.trimEnd().split('\n')
  t.assert.ok(jsonl.endsWith('\n'), 'ends nonempty JSONL output with a newline')
  t.assert.equal(lines.length, 1, 'writes one JSON object per source file')
  const record = JSON.parse(lines[0])
  t.assert.deepEqual([record.file, record.relativePath], [fullPath, 'src/app.js'], 'keeps unambiguous file identity')
  t.assert.deepEqual(record.ics[0], {
    functionName: 'run',
    line: 2,
    column: 3,
    updates: [{ type: 'LoadIC', oldState: 1, newState: 2, key: 'value', map: '0x123', optimizationState: 1, severity: 2 }]
  }, 'keeps readable inline cache details')
  t.assert.deepEqual(record.deopts[0].updates[0], {
    timestamp: 1234, bailoutType: 'eager', deoptReason: 'wrong map', optimizationState: 2, inlined: false, severity: 3
  }, 'keeps deoptimization details')
  t.assert.deepEqual(record.codes[0], {
    functionName: 'run',
    line: 1,
    column: 1,
    isScript: true,
    updates: [{ timestamp: 1000, state: 2, severity: 3 }]
  }, 'keeps optimization details')
  t.assert.equal((lines[0].match(/"file":"\/project\/src\/app\.js"/g) || []).length, 1, 'writes the full path once')
  t.assert.ok(!lines[0].includes('large source omitted'), 'omits source text')
  const concatenatedLines = (jsonl + jsonl).trimEnd().split('\n')
  t.assert.equal(concatenatedLines.map(line => JSON.parse(line).file).length, 2, 'keeps records parseable when reports are concatenated')
})

test('JSONL output for an empty report is empty', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  t.assert.equal(toJsonl(new Map()), '', 'does not emit a standalone blank record')
})
