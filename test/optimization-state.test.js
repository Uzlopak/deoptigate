'use strict'

const test = require('tape')
const {
    OPTIMIZATION_STATE_COMPILED
  , OPTIMIZATION_STATE_OPTIMIZABLE
  , OPTIMIZATION_STATE_OPTIMIZED
  , parseOptimizationState
  , nameOptimizationState
  , severityOfOptimizationState
} = require('../lib/log-processing/optimization-state')

test('optimization states parse, name, and map to severity', (t) => {
  t.equal(parseOptimizationState(''), OPTIMIZATION_STATE_COMPILED, 'empty state is compiled')
  t.equal(parseOptimizationState('~'), OPTIMIZATION_STATE_OPTIMIZABLE, 'tilde state is optimizable')
  t.equal(parseOptimizationState('*'), OPTIMIZATION_STATE_OPTIMIZED, 'asterisk state is optimized')
  t.equal(parseOptimizationState('^'), OPTIMIZATION_STATE_OPTIMIZED, 'Maglev state is optimized')

  t.equal(nameOptimizationState(OPTIMIZATION_STATE_COMPILED), 'compiled', 'compiled state name')
  t.equal(nameOptimizationState(OPTIMIZATION_STATE_OPTIMIZABLE), 'optimizable', 'optimizable state name')
  t.equal(nameOptimizationState(OPTIMIZATION_STATE_OPTIMIZED), 'optimized', 'optimized state name')
  t.equal(nameOptimizationState(-1), 'unknown', 'unknown state name')

  t.equal(severityOfOptimizationState(OPTIMIZATION_STATE_COMPILED), 3, 'compiled state severity')
  t.equal(severityOfOptimizationState(OPTIMIZATION_STATE_OPTIMIZABLE), 2, 'optimizable state severity')
  t.equal(severityOfOptimizationState(OPTIMIZATION_STATE_OPTIMIZED), 1, 'optimized state severity')
  t.equal(severityOfOptimizationState(-1), 3, 'unknown state severity')

  t.throws(() => parseOptimizationState('?'), /unknown code state: \?/,
    'unsupported code state is rejected')
  t.throws(() => nameOptimizationState(99), /unknown code state: 99/,
    'unsupported state name is rejected')
  t.throws(() => severityOfOptimizationState(99), /unknown code state: 99/,
    'unsupported state severity is rejected')
  t.end()
})
