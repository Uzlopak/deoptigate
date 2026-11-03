'use strict'

const { test } = require('node:test')
const { keyLocation, unkeyLocation, byLocationKey } = require('../lib/grouping/location')

test('location keys preserve colons in function names', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  /** @type {import('../lib/grouping/location').Location} */
  const location = { functionName: 'module:run', line: 12, column: 4 }
  const key = keyLocation(location)

  t.assert.equal(key, 'module:run:12:4', 'location key contains the function name and coordinates')
  t.assert.deepEqual(unkeyLocation(key), location, 'coordinates are decoded from the right')
  t.assert.equal(
    byLocationKey('module:run:4:2', 'module:run:12:1'),
    -1,
    'location keys with colon names sort by numeric line and column'
  )
})
