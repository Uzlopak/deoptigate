'use strict'

const test = require('tape')
const { MIN_SEVERITY } = require('../lib/severities')
const {
    parseIcState
  , nameIcState
  , severityIcState
} = require('../lib/log-processing/ic-state')

test('parseIcState supports V8 inline-cache state codes', (t) => {
  const states = [
      [ '0', 0 ]
    , [ 'X', 0 ]
    , [ '.', 1 ]
    , [ '1', 2 ]
    , [ '^', 3 ]
    , [ 'P', 4 ]
    , [ 'N', 5 ]
    , [ 'G', 6 ]
  ]

  for (const [ code, state ] of states) {
    t.equal(parseIcState(code), state, `${JSON.stringify(code)} maps to state ${state}`)
  }
  t.throws(() => parseIcState('?'), /unknown ic code state/, 'unknown state codes throw')
  t.end()
})

test('nameIcState names every inline-cache state', (t) => {
  const names = [
      [ 0, 'unintialized' ]
    , [ 1, 'premonomorphic' ]
    , [ 2, 'monomorphic' ]
    , [ 3, 'recompute handler' ]
    , [ 4, 'polymorphic' ]
    , [ 5, 'megamorphic' ]
    , [ 6, 'generic' ]
  ]

  for (const [ state, name ] of names) {
    t.equal(nameIcState(state), name, `state ${state} is named ${name}`)
  }
  t.throws(() => nameIcState(-1), /unknown ic code state/, 'unknown states throw')
  t.end()
})

test('severityIcState groups inline-cache states by severity', (t) => {
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
    t.equal(severityIcState(state), severity, `state ${state} has severity ${severity}`)
  }
  t.throws(() => severityIcState(-1), /unknown ic code state/, 'unknown states throw')
  t.end()
})
