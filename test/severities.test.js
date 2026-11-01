'use strict'

const test = require('tape')
const {
  severityColors,
  MIN_SEVERITY,
  highestSeverity,
  lowestSeverity
} = require('../lib/severities')

test('severity constants and colors', (t) => {
  t.equal(MIN_SEVERITY, 1, 'minimum severity starts at one')
  t.deepEqual(severityColors, [ 'green', 'blue', 'dark-red' ], 'colors map to severity levels')
  t.end()
})

test('highestSeverity returns the greatest severity or its empty-list default', (t) => {
  t.equal(highestSeverity([]), MIN_SEVERITY, 'empty list starts at minimum severity')
  t.equal(highestSeverity([{ severity: 2 }, { severity: 1 }]), 2, 'retains the current maximum')
  t.equal(highestSeverity([{ severity: 1 }, { severity: 3 }, { severity: 2 }]), 3, 'updates the maximum')
  t.end()
})

test('lowestSeverity returns the least severity or its empty-list default', (t) => {
  t.equal(lowestSeverity([]), 99, 'empty list starts at sentinel severity')
  t.equal(lowestSeverity([{ severity: 2 }, { severity: 3 }]), 2, 'retains the current minimum')
  t.equal(lowestSeverity([{ severity: 3 }, { severity: 1 }, { severity: 2 }]), 1, 'updates the minimum')
  t.end()
})
