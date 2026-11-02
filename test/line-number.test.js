'use strict'

const { test } = require('node:test')
const { getDigits, pad } = require('../lib/rendering/line-number')

test('line-number digit counts change at every decimal threshold', (t) => {
  t.plan(19)
  const thresholds = [
    [ 1, 1 ], [ 9, 1 ], [ 10, 2 ], [ 99, 2 ], [ 100, 3 ],
    [ 999, 3 ], [ 1000, 4 ], [ 9999, 4 ], [ 10000, 5 ],
    [ 99999, 5 ], [ 100000, 6 ], [ 999999, 6 ], [ 1000000, 7 ],
    [ 9999999, 7 ], [ 10000000, 8 ], [ 99999999, 8 ],
    [ 100000000, 9 ], [ 999999999, 9 ], [ 1000000000, 10 ]
  ]
  for (const [ value, digits ] of thresholds) {
    t.assert.equal(getDigits(value), digits, `${value} uses ${digits} digits`)
  }
})

test('line-number padding handles every supported padding width', (t) => {
  t.plan(13)
  for (let spaces = 0; spaces <= 10; spaces++) {
    t.assert.equal(pad(1, spaces + 1), ' '.repeat(spaces) + '1', `${spaces} leading spaces`)
  }
  t.assert.equal(pad(1000000, 7), '1000000', 'seven-digit line number is not overpadded')
  t.assert.equal(pad(1000000, 8), ' 1000000', 'seven-digit line number aligns in an eight-digit column')
})
