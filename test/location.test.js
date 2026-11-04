'use strict'

const { test } = require('node:test')
const { byLocation, byLocationKey, unkeyLocation } = require('../lib/grouping/location')

/**
 * @param {import('../lib/grouping/location').Location | null} location
 * @returns {import('../lib/grouping/location').Location}
 */
function requireLocation (location) {
  if (location == null) throw new Error('expected a parsed location')
  return location
}

test('unkeyLocation returns null for a missing key', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(10)
  t.assert.equal(unkeyLocation(null), null)
  t.assert.deepEqual(unkeyLocation('doThing:12:4'), {
    functionName: 'doThing',
    line: 12,
    column: 4
  }, 'parses a valid location key')
  const malformed = requireLocation(unkeyLocation('not-a-location'))
  t.assert.equal(malformed.functionName, 'not-a-location', 'retains the function segment in malformed keys')
  t.assert.ok(Number.isNaN(malformed.line), 'malformed line becomes NaN')
  t.assert.ok(Number.isNaN(malformed.column), 'malformed column becomes NaN')
  t.assert.equal(byLocation({ functionName: 'first', line: 1, column: 1 }, { functionName: 'second', line: 1, column: 2 }), -1)
  t.assert.equal(byLocation({ functionName: 'first', line: 2, column: 1 }, { functionName: 'second', line: 1, column: 2 }), 1)
  t.assert.equal(byLocation({ functionName: 'first', line: 1, column: 2 }, { functionName: 'second', line: 1, column: 2 }), 0)
  t.assert.equal(byLocation({ functionName: 'first', line: 1, column: 3 }, { functionName: 'second', line: 1, column: 2 }), 1)
  t.assert.equal(byLocationKey('valid:2:1', 'also-valid:1:1'), 1, 'compares parsed location keys')
})

test('byLocationKey treats a missing location as equal', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  t.assert.equal(byLocationKey(/** @type {string} */ (/** @type {unknown} */ (null)), 'valid:1:1'), 0)
  t.assert.equal(byLocationKey('valid:1:1', /** @type {string} */ (/** @type {unknown} */ (null))), 0)
})
