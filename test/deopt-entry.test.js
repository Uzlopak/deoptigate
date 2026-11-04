'use strict'

const { test } = require('node:test')
const DeoptEntry = require('../lib/log-processing/deopt-entry')

test('DeoptEntry normalizes bailout types and records severity', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(22)
  const entry = new DeoptEntry('compute /src/app.js', '/src/app.js', 12, 4)
  /** @type {Array<[string, number, string]>} */
  const cases = [
    ['"soft"', 1, 'soft'],
    ['lazy', 2, 'lazy'],
    ['dependency-change', 2, 'dependency-change'],
    ['"deopt-eager"', 3, 'eager'],
    ['unrecognized', 3, 'unrecognized']
  ]

  for (const [type, severity, expectedType] of cases) {
    entry.addUpdate(10, type, '"reason"', 1, -1)
    const update = entry.updates[entry.updates.length - 1]
    t.assert.equal(update.bailoutType, expectedType, `${type}: normalized type`)
    t.assert.equal(update.severity, severity, `${type}: severity`)
    t.assert.equal(update.deoptReason, 'reason', `${type}: quoted reason is unwrapped`)
    t.assert.equal(update.inlined, false, `${type}: -1 inlining id means not inlined`)
  }

  entry.addUpdate(11, 'eager', 'reason', 2, 0)
  t.assert.equal(entry.updates[5].inlined, true, 'non-negative inlining id means inlined')
  t.assert.deepEqual(entry.hashmap, {
    functionName: 'compute',
    file: '/src/app.js',
    line: 12,
    column: 4,
    updates: entry.updates
  }, 'hashmap exposes entry fields and updates')
})

test('DeoptEntry parses or rejects V8 source positions', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition('</src/app.js:12:4>'),
    { file: '/src/app.js', line: 12, column: 4 },
    'valid source position is parsed'
  )
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition('<C:\\work\\app.js:7:2>'),
    { file: 'C:\\work\\app.js', line: 7, column: 2 },
    'Windows drive colon stays in the file path'
  )
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition('not a source position'),
    { file: null, line: 0, column: 0 },
    'malformed source position returns fallback coordinates'
  )
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition('garbage </src/app.js:12:4> trailing'),
    { file: null, line: 0, column: 0 },
    'rejects a valid-looking substring inside malformed input'
  )
})

test('DeoptEntry attributes inlined positions to the innermost user frame', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(6)
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition('</src/app.js:76:57> inlined at </src/app.js:170:9>'),
    { file: '/src/app.js', line: 76, column: 57 },
    'keeps the position where the deopt happened'
  )
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition(
      '<node:internal/streams/readable:870:11> inlined at <node:internal/streams/readable:400:5>' +
      ' inlined at </src/app.js:78:10> inlined at </src/app.js:170:9>'
    ),
    { file: '/src/app.js', line: 78, column: 10 },
    'skips Node.js internals inlined into user code'
  )
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition('<file:///src/app.mjs:4:2> inlined at </src/other.js:9:1>'),
    { file: 'file:///src/app.mjs', line: 4, column: 2 },
    'accepts file URLs as user frames'
  )
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition('<node:events:1:2> inlined at <node:internal/streams/state:3:4>'),
    { file: 'node:events', line: 1, column: 2 },
    'keeps the innermost frame when every frame is internal'
  )
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition('</src/app.js:1:2> inlined at not a position'),
    { file: null, line: 0, column: 0 },
    'rejects a chain ending in a malformed frame'
  )
  t.assert.deepEqual(
    DeoptEntry.disassembleSourcePosition('<not a position> inlined at </src/app.js:1:2>'),
    { file: null, line: 0, column: 0 },
    'rejects a chain starting with a malformed frame'
  )
})

test('DeoptEntry preserves function names containing spaces', (
  /** @type {import('node:test').TestContext} */ t
) => {
  const entry = new DeoptEntry('with space [eval]', '[eval]', 1, 28)
  t.assert.equal(entry.hashmap.functionName, 'with space', 'keeps the complete V8 function name')
})
