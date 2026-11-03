'use strict'

const { test } = require('node:test')
const {
    OPTIMIZATION_STATE_COMPILED
  , OPTIMIZATION_STATE_OPTIMIZABLE
  , OPTIMIZATION_STATE_OPTIMIZED
  , parseOptimizationState
  , nameOptimizationState
  , severityOfOptimizationState
} = require('../lib/log-processing/optimization-state')

test('optimization states parse, name, and map to severity', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(15)
  t.assert.equal(parseOptimizationState(''), OPTIMIZATION_STATE_COMPILED, 'empty state is compiled')
  t.assert.equal(parseOptimizationState('~'), OPTIMIZATION_STATE_OPTIMIZABLE, 'tilde state is optimizable')
  t.assert.equal(parseOptimizationState('*'), OPTIMIZATION_STATE_OPTIMIZED, 'asterisk state is optimized')
  t.assert.equal(parseOptimizationState('^'), OPTIMIZATION_STATE_OPTIMIZED, 'Maglev state is optimized')

  t.assert.equal(nameOptimizationState(OPTIMIZATION_STATE_COMPILED), 'compiled', 'compiled state name')
  t.assert.equal(nameOptimizationState(OPTIMIZATION_STATE_OPTIMIZABLE), 'optimizable', 'optimizable state name')
  t.assert.equal(nameOptimizationState(OPTIMIZATION_STATE_OPTIMIZED), 'optimized', 'optimized state name')
  t.assert.equal(nameOptimizationState(-1), 'unknown', 'unknown state name')

  t.assert.equal(severityOfOptimizationState(OPTIMIZATION_STATE_COMPILED), 3, 'compiled state severity')
  t.assert.equal(severityOfOptimizationState(OPTIMIZATION_STATE_OPTIMIZABLE), 2, 'optimizable state severity')
  t.assert.equal(severityOfOptimizationState(OPTIMIZATION_STATE_OPTIMIZED), 1, 'optimized state severity')
  t.assert.equal(severityOfOptimizationState(-1), 3, 'unknown state severity')

  // @ts-expect-error Invalid input is intentionally tested at runtime.
  t.assert.throws(() => parseOptimizationState('?'), /unknown code state: \?/,
    'unsupported code state is rejected')
  // @ts-expect-error Invalid state is intentionally tested at runtime.
  t.assert.throws(() => nameOptimizationState(99), /unknown code state: 99/,
    'unsupported state name is rejected')
  // @ts-expect-error Invalid state is intentionally tested at runtime.
  t.assert.throws(() => severityOfOptimizationState(99), /unknown code state: 99/,
    'unsupported state severity is rejected')
})
