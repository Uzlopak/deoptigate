'use strict'

const test = require('tape')
const { byLocation, unkeyLocation } = require('../lib/grouping/location')

test('unkeyLocation returns null for a missing key', (t) => {
  t.equal(unkeyLocation(null), null)
  t.deepEqual(unkeyLocation('doThing:12:4'), {
    functionName: 'doThing',
    line: 12,
    column: 4
  }, 'parses a valid location key')
  const malformed = unkeyLocation('not-a-location')
  t.equal(malformed.functionName, 'not-a-location', 'retains the function segment in malformed keys')
  t.ok(Number.isNaN(malformed.line), 'malformed line becomes NaN')
  t.ok(Number.isNaN(malformed.column), 'malformed column becomes NaN')
  t.equal(byLocation({ line: 1, column: 1 }, { line: 1, column: 2 }), -1)
  t.equal(byLocation({ line: 1, column: 2 }, { line: 1, column: 2 }), 0)
  t.end()
})
