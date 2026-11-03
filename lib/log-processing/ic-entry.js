'use strict'

const {
    parseIcState
  , severityIcState
} = require('./ic-state')
const { splitFunctionAndFile } = require('./function-file')
const STARTING_QUOTE_RX = /^"/
const ENDING_QUOTE_RX = /"$/

/** @typedef {import('./ic-state').IcStateCode} IcStateCode */
/** @typedef {import('./ic-state').IcState} IcState */

/**
 * @param {string} s
 * @returns {string}
 */
function unquote(s) {
  // for some reason Node.js double quotes the file names
  return s.replace(STARTING_QUOTE_RX, '').replace(ENDING_QUOTE_RX, '')
}

/**
 * @typedef {object} IcUpdate
 * @property {string} type
 * @property {IcState} oldState
 * @property {IcState} newState
 * @property {string} key
 * @property {string} map
 * @property {import('./optimization-state').OptimizationState} optimizationState
 * @property {import('../severities').Severity} severity
 */

/**
 * An inline cache record parsed from a V8 log.
 * @property {string} functionName
 * @property {string | null} file
 * @property {number} line
 * @property {number} column
 * @property {IcUpdate[]} updates
 */
class IcEntry {
  /**
   * @param {string} fnFile
   * @param {number} line
   * @param {number} column
   */
  constructor(
      fnFile
    , line
    , column
  ) {
    fnFile = unquote(fnFile)
    const { functionName, file } = splitFunctionAndFile(fnFile)

    this.functionName = functionName
    this.file = file
    this.line = line
    this.column = column
    /** @type {IcUpdate[]} */
    this.updates = []
  }

  /**
   * Record an inline cache state update.
   * @param {string} type
   * @param {string} oldState Raw state character from the V8 log.
   * @param {string} newState Raw state character from the V8 log.
   * @param {string} key
   * @param {number} map
   * @param {import('./optimization-state').OptimizationState} optimizationState
   * @returns {void}
   */
  addUpdate(type, oldState, newState, key, map, optimizationState) {
    const mapHex = map.toString(16)
    const oldStateId = parseIcState(/** @type {IcStateCode} */ (oldState))
    const newStateId = parseIcState(/** @type {IcStateCode} */ (newState))
    const severity = severityIcState(newStateId)

    this.updates.push({
        type
      , oldState: oldStateId
      , newState: newStateId
      , key
      , map: mapHex
      , optimizationState
      , severity
    })
  }

  /** Keep only updates where the inline cache state changed. @returns {void} */
  filterIcStateChanges() {
    this.updates = this.updates.filter(x => x.oldState !== x.newState)
  }

  /** @returns {{ functionName: string, file: string | null, line: number, column: number, updates: IcUpdate[] }} */
  get hashmap() {
    return {
        functionName : this.functionName
      , file         : this.file
      , line         : this.line
      , column       : this.column
      , updates      : this.updates
    }
  }
}

module.exports = IcEntry
