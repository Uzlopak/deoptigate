'use strict'

const { MIN_SEVERITY, SEVERITY_LEVELS } = require('../severities')

const UNINITIALIZED = 0
const PREMONOMORPHIC = 1
const MONOMORPHIC = 2
const RECOMPUTE_HANDLER = 3
const POLYMORPHIC = 4
const MEGAMORPHIC = 5
const GENERIC = 6

const IC_STATE_CODES = /** @type {const} */ ([
    '0', 'X', '.', '1', '^', 'P', 'N', 'G'
])

/**
 * Numeric state identifiers used for inline cache states.
 * @typedef {typeof UNINITIALIZED | typeof PREMONOMORPHIC | typeof MONOMORPHIC | typeof RECOMPUTE_HANDLER | typeof POLYMORPHIC | typeof MEGAMORPHIC | typeof GENERIC} IcState
 */
/** @typedef {typeof IC_STATE_CODES[number]} IcStateCode */

/**
 * Parse the state code emitted by V8 into its numeric identifier.
 * @param {IcStateCode} s
 * @returns {IcState}
 */
function parseIcState(s) {
  switch (s) {
    case '0': return UNINITIALIZED
    // Recent V8 versions use X for an IC without usable feedback.
    case 'X': return UNINITIALIZED
    case '.': return PREMONOMORPHIC
    case '1': return MONOMORPHIC
    case '^': return RECOMPUTE_HANDLER
    case 'P': return POLYMORPHIC
    case 'N': return MEGAMORPHIC
    case 'G': return GENERIC
    default: throw new Error('parse: unknown ic code state: ' + s)
  }
}

/**
 * Return the display name for an inline cache state.
 * @param {IcState} state
 * @returns {'unintialized' | 'premonomorphic' | 'monomorphic' | 'recompute handler' | 'polymorphic' | 'megamorphic' | 'generic'}
 */
function nameIcState(state) {
  switch (state) {
    case UNINITIALIZED     : return 'unintialized'
    case PREMONOMORPHIC    : return 'premonomorphic'
    case MONOMORPHIC       : return 'monomorphic'
    case RECOMPUTE_HANDLER : return 'recompute handler'
    case POLYMORPHIC       : return 'polymorphic'
    case MEGAMORPHIC       : return 'megamorphic'
    case GENERIC           : return 'generic'
    default: throw new Error('name: unknown ic code state : ' + state)
  }
}

/**
 * Return the severity score associated with an inline cache state.
 * @param {IcState} state
 * @returns {import('../severities').Severity}
 */
function severityIcState(state) {
  switch (state) {
    case UNINITIALIZED     : return MIN_SEVERITY
    case PREMONOMORPHIC    : return MIN_SEVERITY
    case MONOMORPHIC       : return MIN_SEVERITY
    case RECOMPUTE_HANDLER : return MIN_SEVERITY
    case POLYMORPHIC       : return SEVERITY_LEVELS[1]
    case MEGAMORPHIC       : return SEVERITY_LEVELS[2]
    case GENERIC           : return SEVERITY_LEVELS[2]
    default: throw new Error('severity: unknown ic code state : ' + state)
  }
}

module.exports = {
    parseIcState
  , nameIcState
  , severityIcState
  , IC_STATE_CODES
}
