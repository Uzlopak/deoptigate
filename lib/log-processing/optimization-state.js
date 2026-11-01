'use strict'

const OPTIMIZATION_STATE_COMPILED = 0
const OPTIMIZATION_STATE_OPTIMIZABLE = 1
const OPTIMIZATION_STATE_OPTIMIZED = 2

function parseOptimizationState(s) {
  switch (s) {
    case '': return OPTIMIZATION_STATE_COMPILED
    case '~': return OPTIMIZATION_STATE_OPTIMIZABLE
    case '*': return OPTIMIZATION_STATE_OPTIMIZED
    // V8 uses '^' for Maglev optimized code.
    case '^': return OPTIMIZATION_STATE_OPTIMIZED
    default: throw new Error('unknown code state: ' + s)
  }
}

function nameOptimizationState(state) {
  switch (state) {
    case OPTIMIZATION_STATE_COMPILED: return 'compiled'
    case OPTIMIZATION_STATE_OPTIMIZABLE: return 'optimizable'
    case OPTIMIZATION_STATE_OPTIMIZED: return 'optimized'
    case -1: return 'unknown'
    default: throw new Error('unknown code state: ' + state)
  }
}

function severityOfOptimizationState(state) {
  switch (state) {
    case OPTIMIZATION_STATE_COMPILED: return 3
    case OPTIMIZATION_STATE_OPTIMIZABLE: return 2
    case OPTIMIZATION_STATE_OPTIMIZED: return 1
    case -1: return 3
    default: throw new Error('unknown code state: ' + state)
  }
}

module.exports = {
    OPTIMIZATION_STATE_COMPILED
  , OPTIMIZATION_STATE_OPTIMIZABLE
  , OPTIMIZATION_STATE_OPTIMIZED
  , parseOptimizationState
  , nameOptimizationState
  , severityOfOptimizationState
}
