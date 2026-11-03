'use strict'

const { test } = require('node:test')
const summaryEmptyMessage = require('../app/lib/summary-empty-state')

test('summary empty states distinguish missing events from filtered events', (
  /** @type {import('node:test').TestContext} */ t
) => {
  t.assert.equal(summaryEmptyMessage(0, 0), 'None', 'reports categories without any source locations')
  t.assert.equal(
    summaryEmptyMessage(2, 0),
    'No events match the current severity filter.',
    'explains when locations exist but all events are filtered'
  )
  t.assert.equal(summaryEmptyMessage(2, 1), null, 'does not show an empty message when records remain')
})
