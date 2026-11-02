'use strict'

const { test } = require('node:test')
const {
  severityColors,
  MIN_SEVERITY,
  highestSeverity,
  lowestSeverity
} = require('../lib/severities')

test('severity constants and colors', (t) => {
  t.plan(2)
  t.assert.equal(MIN_SEVERITY, 1, 'minimum severity starts at one')
  t.assert.deepEqual(severityColors, [ 'green', 'blue', 'dark-red' ], 'colors map to severity levels')
})

test('highestSeverity returns the greatest severity or its empty-list default', (t) => {
  t.plan(3)
  t.assert.equal(highestSeverity([]), MIN_SEVERITY, 'empty list starts at minimum severity')
  t.assert.equal(highestSeverity([{ severity: 2 }, { severity: 1 }]), 2, 'retains the current maximum')
  t.assert.equal(highestSeverity([{ severity: 1 }, { severity: 3 }, { severity: 2 }]), 3, 'updates the maximum')
})

test('lowestSeverity returns the least severity or its empty-list default', (t) => {
  t.plan(3)
  t.assert.equal(lowestSeverity([]), 99, 'empty list starts at sentinel severity')
  t.assert.equal(lowestSeverity([{ severity: 2 }, { severity: 3 }]), 2, 'retains the current minimum')
  t.assert.equal(lowestSeverity([{ severity: 3 }, { severity: 1 }, { severity: 2 }]), 1, 'updates the minimum')
})
