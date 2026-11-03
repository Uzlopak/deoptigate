'use strict'

const { test } = require('node:test')
const summaryNavigationAttributes = require('../app/lib/summary-navigation')

test('summary categories expose their active state for assistive technology', (
  /** @type {import('node:test').TestContext} */ t
) => {
  t.assert.deepEqual(
    summaryNavigationAttributes(true),
    { 'aria-current': 'true' },
    'marks the selected category as current'
  )
  t.assert.deepEqual(
    summaryNavigationAttributes(false),
    { 'aria-current': undefined },
    'does not mark inactive categories as current'
  )
})
