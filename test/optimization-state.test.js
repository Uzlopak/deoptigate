'use strict'

const test = require('tape')
const { Profile } = require('v8-tools-core/profile')
const {
    parseOptimizationState
  , nameOptimizationState
  , severityOfOptimizationState
} = require('../lib/log-processing/optimization-state')

test('optimization states parse, name, and map to severity', (t) => {
  const { CodeState } = Profile

  t.equal(parseOptimizationState(''), CodeState.COMPILED, 'empty state is compiled')
  t.equal(parseOptimizationState('~'), CodeState.OPTIMIZABLE, 'tilde state is optimizable')
  t.equal(parseOptimizationState('*'), CodeState.OPTIMIZED, 'asterisk state is optimized')
  t.equal(parseOptimizationState('^'), CodeState.OPTIMIZED, 'Maglev state is optimized')

  t.equal(nameOptimizationState(CodeState.COMPILED), 'compiled', 'compiled state name')
  t.equal(nameOptimizationState(CodeState.OPTIMIZABLE), 'optimizable', 'optimizable state name')
  t.equal(nameOptimizationState(CodeState.OPTIMIZED), 'optimized', 'optimized state name')
  t.equal(nameOptimizationState(-1), 'unknown', 'unknown state name')

  t.equal(severityOfOptimizationState(CodeState.COMPILED), 3, 'compiled state severity')
  t.equal(severityOfOptimizationState(CodeState.OPTIMIZABLE), 2, 'optimizable state severity')
  t.equal(severityOfOptimizationState(CodeState.OPTIMIZED), 1, 'optimized state severity')
  t.equal(severityOfOptimizationState(-1), 3, 'unknown state severity')

  t.throws(() => parseOptimizationState('?'), /unknown code state: \?/,
    'unsupported code state is rejected')
  t.throws(() => nameOptimizationState(99), /unknown code state: 99/,
    'unsupported state name is rejected')
  t.throws(() => severityOfOptimizationState(99), /unknown code state: 99/,
    'unsupported state severity is rejected')
  t.end()
})
