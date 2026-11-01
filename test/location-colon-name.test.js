'use strict'

const test = require('tape')
const { keyLocation, unkeyLocation, byLocationKey } = require('../lib/grouping/location')

test('location keys preserve colons in function names', (t) => {
  const location = { functionName: 'module:run', line: 12, column: 4 }
  const key = keyLocation(location)

  t.equal(key, 'module:run:12:4', 'location key contains the function name and coordinates')
  t.deepEqual(unkeyLocation(key), location, 'coordinates are decoded from the right')
  t.equal(
    byLocationKey('module:run:4:2', 'module:run:12:1'),
    -1,
    'location keys with colon names sort by numeric line and column'
  )
  t.end()
})
