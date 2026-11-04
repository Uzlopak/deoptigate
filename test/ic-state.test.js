'use strict'

const { test } = require('node:test')
const { MIN_SEVERITY } = require('../lib/severities')
const {
    parseIcState
  , nameIcState
  , severityIcState
} = require('../lib/log-processing/ic-state')

/** @typedef {import('../lib/log-processing/ic-state').IcState} TestIcState */

// These adapters keep invalid-input tests explicit while preserving the
// narrower public input types of the production functions.
/**
 * @param {string} code
 * @returns {number}
 */
function parseUncheckedState(code) {
  return /** @type {(value: string) => number} */ (parseIcState)(code)
}

/**
 * @param {number} state
 * @returns {string}
 */
function nameUncheckedState(state) {
  return /** @type {(value: number) => string} */ (nameIcState)(state)
}

/**
 * @param {number} state
 * @returns {number}
 */
function severityUncheckedState(state) {
  return /** @type {(value: number) => number} */ (severityIcState)(state)
}

test('parseIcState supports V8 inline-cache state codes', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(10)
  /** @type {Array<['0' | 'X' | '.' | '1' | '^' | 'P' | 'N' | 'D' | 'G', TestIcState]>} */
  const states = [
      [ '0', 0 ]
    , [ 'X', 0 ]
    , [ '.', 1 ]
    , [ '1', 2 ]
    , [ '^', 3 ]
    , [ 'P', 4 ]
    , [ 'N', 5 ]
    , [ 'D', 5 ]
    , [ 'G', 6 ]
  ]

  for (const [ code, state ] of states) {
    t.assert.equal(parseIcState(code), state, `${JSON.stringify(code)} maps to state ${state}`)
  }
  t.assert.throws(() => parseUncheckedState('?'), /unknown ic code state/, 'unknown state codes throw')
})

test('nameIcState names every inline-cache state', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(8)
  /** @type {Array<[TestIcState, string]>} */
  const names = [
      [ 0, 'uninitialized' ]
    , [ 1, 'premonomorphic' ]
    , [ 2, 'monomorphic' ]
    , [ 3, 'recompute handler' ]
    , [ 4, 'polymorphic' ]
    , [ 5, 'megamorphic' ]
    , [ 6, 'generic' ]
  ]

  for (const [ state, name ] of names) {
    t.assert.equal(nameIcState(state), name, `state ${state} is named ${name}`)
  }
  t.assert.throws(() => nameUncheckedState(-1), /unknown ic code state/, 'unknown states throw')
})

test('severityIcState groups inline-cache states by severity', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(8)
  /** @type {Array<[TestIcState, number]>} */
  const severities = [
      [ 0, MIN_SEVERITY ]
    , [ 1, MIN_SEVERITY ]
    , [ 2, MIN_SEVERITY ]
    , [ 3, MIN_SEVERITY ]
    , [ 4, MIN_SEVERITY + 1 ]
    , [ 5, MIN_SEVERITY + 2 ]
    , [ 6, MIN_SEVERITY + 2 ]
  ]

  for (const [ state, severity ] of severities) {
    t.assert.equal(severityIcState(state), severity, `state ${state} has severity ${severity}`)
  }
  t.assert.throws(() => severityUncheckedState(-1), /unknown ic code state/, 'unknown states throw')
})
