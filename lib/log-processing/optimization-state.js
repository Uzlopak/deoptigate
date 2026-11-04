'use strict'

const OPTIMIZATION_STATE_COMPILED = /** @type {const} */ (0)
const OPTIMIZATION_STATE_OPTIMIZABLE = /** @type {const} */ (1)
const OPTIMIZATION_STATE_OPTIMIZED = /** @type {const} */ (2)
const OPTIMIZATION_STATE_MARKERS = /** @type {const} */ (['', '~', '^', '+', "+'", '*', "*'"])

/** @typedef {typeof OPTIMIZATION_STATE_COMPILED | typeof OPTIMIZATION_STATE_OPTIMIZABLE | typeof OPTIMIZATION_STATE_OPTIMIZED} ParsedOptimizationState */
/** @typedef {ParsedOptimizationState | -1} OptimizationState */
/** @typedef {typeof OPTIMIZATION_STATE_MARKERS[number]} OptimizationStateMarker */

/**
 * Convert a V8 optimization marker to its numeric state.
 *
 * @param {OptimizationStateMarker} s
 * @returns {ParsedOptimizationState}
 */
function parseOptimizationState(s) {
  switch (s) {
    case '': return OPTIMIZATION_STATE_COMPILED
    // V8 tiers a function through ~ (Ignition), ^ (Sparkplug), + (Maglev) and
    // * (TurboFan). A trailing ' marks context-specialized optimized code.
    case '~': return OPTIMIZATION_STATE_OPTIMIZABLE
    case '^': return OPTIMIZATION_STATE_OPTIMIZABLE
    case '+': return OPTIMIZATION_STATE_OPTIMIZED
    case "+'": return OPTIMIZATION_STATE_OPTIMIZED
    case '*': return OPTIMIZATION_STATE_OPTIMIZED
    case "*'": return OPTIMIZATION_STATE_OPTIMIZED
    default: throw new Error('unknown code state: ' + s)
  }
}

/**
 * Return the display name for a known optimization state.
 *
 * @param {OptimizationState} state
 * @returns {'compiled' | 'optimizable' | 'optimized' | 'unknown'}
 */
function nameOptimizationState(state) {
  switch (state) {
    case OPTIMIZATION_STATE_COMPILED: return 'compiled'
    case OPTIMIZATION_STATE_OPTIMIZABLE: return 'optimizable'
    case OPTIMIZATION_STATE_OPTIMIZED: return 'optimized'
    case -1: return 'unknown'
    default: throw new Error('unknown code state: ' + state)
  }
}

/**
 * Map an optimization state to the severity used by the visualizer.
 *
 * @param {OptimizationState} state
 * @returns {import('../severities').Severity}
 */
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
  , OPTIMIZATION_STATE_MARKERS
  , parseOptimizationState
  , nameOptimizationState
  , severityOfOptimizationState
}
