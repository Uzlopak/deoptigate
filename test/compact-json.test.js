'use strict'

const { test } = require('node:test')
const compactJson = require('../lib/compact-json')

test('compact JSON retains event details and omits source and duplicate paths', (
  /** @type {import('node:test').TestContext} */ t
) => {
  t.plan(6)
  const fullPath = '/project/src/app.js'
  const report = new Map([[ fullPath, {
    fullPath,
    relativePath: 'src/app.js',
    src: 'function run () { /* large source omitted */ }',
    ics: [{
      functionName: 'run', file: fullPath, line: 2, column: 3,
      updates: [{ type: 'LoadIC', oldState: 1, newState: 2, key: 'value', map: '0x123', optimizationState: 1, severity: 2 }]
    }],
    deopts: [{
      functionName: 'run', file: fullPath, line: 2, column: 8,
      updates: [{ timestamp: 1234, bailoutType: 'eager', deoptReason: 'wrong map', optimizationState: 2, inlined: false, severity: 3 }]
    }],
    codes: [{
      functionName: 'run', file: fullPath, line: 1, column: 1, isScript: true,
      updates: [{ timestamp: 1000, state: 2, severity: 3 }]
    }]
  }]])

  const compact = JSON.parse(compactJson(report))
  t.assert.equal(compact[0][0], fullPath, 'keeps the absolute file identity')
  t.assert.deepEqual(compact[0][1][0], [ 'run', 2, 3, [[ 'LoadIC', 1, 2, 'value', '0x123', 1, 2 ]] ], 'keeps inline cache details')
  t.assert.deepEqual(compact[0][2][0], [ 'run', 2, 8, [[ 1234, 'eager', 'wrong map', 2, false, 3 ]] ], 'keeps deoptimization details')
  t.assert.deepEqual(compact[0][3][0], [ 'run', 1, 1, 1, [[ 1000, 2, 3 ]] ], 'keeps optimization details and script markers')
  t.assert.ok(!JSON.stringify(compact).includes('large source omitted'), 'omits source text')
  t.assert.ok(JSON.stringify(compact).length < JSON.stringify(Array.from(report)).length, 'reduces serialized size')
})

test('compact JSON handles empty files and missing event fields', (
  /** @type {import('node:test').TestContext} */ t
) => {
  t.plan(2)
  const report = new Map([
      [ '/project/empty.js', { ics: [], deopts: [], codes: [] } ]
    , [ '/project/unknown.js', {
        ics: [{ updates: [{}] }]
      , deopts: [{ updates: [] }]
      , codes: [{ updates: [{}] }]
    } ]
  ])

  t.assert.deepEqual(JSON.parse(compactJson(report)), [
      [ '/project/empty.js', [], [], [] ]
    , [ '/project/unknown.js', [ [ null, null, null, [[ null, null, null, null, null, null, null ]] ] ], [ [ null, null, null, [] ] ], [ [ null, null, null, 0, [[ null, null, null ]] ] ] ]
  ], 'uses defaults for absent data and handles empty event lists')
  t.assert.ok(compactJson(report).length > 0, 'serializes nonempty file lists')
})
