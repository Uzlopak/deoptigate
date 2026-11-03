'use strict'

/* eslint-disable camelcase */

const { SEVERITY_LEVELS } = require('../severities')
const { splitFunctionAndFile } = require('./function-file')

// <../examples/adders.js:93:27
const sourcePositionRx = /^<(.+):(\d+):(\d+)>$/
const STARTING_QUOTE_RX = /^"/
const ENDING_QUOTE_RX = /"$/
const DEOPT_PREFIX_RX = /^deopt-/

/**
 * @param {string} x
 * @returns {number}
 */
function safeToInt(x) {
  return parseInt(x)
}

const [ SOFT, LAZY, EAGER ] = SEVERITY_LEVELS

/**
 * @param {string} bailoutType
 * @returns {import('../severities').Severity}
 */
function getSeverity(bailoutType) {
  switch (bailoutType) {
    case 'soft': return SOFT
    case 'lazy': return LAZY
    case 'dependency-change': return LAZY
    case 'eager': return EAGER
    // An unknown bailout may come from a newer V8. Keep it visible at the
    // highest severity rather than silently treating it as a soft event.
    default: return EAGER
  }
}

/**
 * @param {string} s
 * @returns {string}
 */
function unquote(s) {
  // for some reason Node.js double quotes the string, i.e. ""eager""
  return s.replace(STARTING_QUOTE_RX, '').replace(ENDING_QUOTE_RX, '')
}

/** @typedef {{ timestamp: number, bailoutType: string, deoptReason: string, optimizationState: import('./optimization-state').OptimizationState, inlined: boolean, severity: import('../severities').Severity }} DeoptUpdate */
/** @typedef {{ file: string | null, line: number, column: number }} SourcePosition */

/** A deoptimization event associated with a source location. */
class DeoptEntry {
  /**
   * @param {string} fnFile Function name and source path as emitted by V8.
   * @param {string} file Source file path.
   * @param {number} line Source line.
   * @param {number} column Source column.
   */
  constructor(
      fnFile
    , file
    , line
    , column
  ) {
    const { functionName } = splitFunctionAndFile(fnFile)

    this.functionName = functionName
    this.file = file
    this.line = line
    this.column = column

    /** @type {DeoptUpdate[]} */
    this.updates = []
  }

  /**
   * Record a deoptimization at this location.
   * @param {number} timestamp
   * @param {string} bailoutType
   * @param {string} deoptReason
   * @param {import('./optimization-state').OptimizationState} optimizationState
   * @param {number} inliningId
   * @returns {void}
   */
  addUpdate(timestamp, bailoutType, deoptReason, optimizationState, inliningId) {
    bailoutType = unquote(bailoutType)
    // Recent V8 versions prefix bailout kinds with "deopt-".
    bailoutType = bailoutType.replace(DEOPT_PREFIX_RX, '')
    deoptReason = unquote(deoptReason)

    const inlined = inliningId !== -1
    const severity = getSeverity(bailoutType)

    this.updates.push({
        timestamp
      , bailoutType
      , deoptReason
      , optimizationState
      , inlined
      , severity
    })
  }

  /** @returns {{ functionName: string, file: string, line: number, column: number, updates: DeoptUpdate[] }} */
  get hashmap() {
    return {
        functionName : this.functionName
      , file         : this.file
      , line         : this.line
      , column       : this.column
      , updates      : this.updates
    }
  }

  /**
   * Parse a V8 source position string.
   * @param {string} sourcePosition
   * @returns {SourcePosition}
   */
  static disassembleSourcePosition(sourcePosition) {
    const m = sourcePositionRx.exec(sourcePosition)
    if (m == null) return { file: null, line: 0, column: 0 }
    return { file: m[1], line: safeToInt(m[2]), column: safeToInt(m[3]) }
  }
}

module.exports = DeoptEntry
