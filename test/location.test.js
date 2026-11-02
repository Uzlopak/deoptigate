'use strict'

const { test } = require('node:test')
const { byLocation, unkeyLocation } = require('../lib/grouping/location')

test('unkeyLocation returns null for a missing key', (t) => {
  t.plan(7)
  t.assert.equal(unkeyLocation(null), null)
  t.assert.deepEqual(unkeyLocation('doThing:12:4'), {
    functionName: 'doThing',
    line: 12,
    column: 4
  }, 'parses a valid location key')
  const malformed = unkeyLocation('not-a-location')
  t.assert.equal(malformed.functionName, 'not-a-location', 'retains the function segment in malformed keys')
  t.assert.ok(Number.isNaN(malformed.line), 'malformed line becomes NaN')
  t.assert.ok(Number.isNaN(malformed.column), 'malformed column becomes NaN')
  t.assert.equal(byLocation({ line: 1, column: 1 }, { line: 1, column: 2 }), -1)
  t.assert.equal(byLocation({ line: 1, column: 2 }, { line: 1, column: 2 }), 0)
})
