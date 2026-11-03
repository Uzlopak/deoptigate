'use strict'

const {
    parseIcState
  , severityIcState
} = require('./ic-state')

const LINE_COLUMN_SUFFIX_RX = /:\d+:\d+$/
const STARTING_QUOTE_RX = /^"/
const ENDING_QUOTE_RX = /"$/

/** @typedef {import('./ic-state').IcStateCode} IcStateCode */
/** @typedef {import('./ic-state').IcState} IcState */

/**
 * @param {string} file
 * @returns {string}
 */
function normalizeFile(file) {
  // Node.js adds :line:column to the end. Remove only that suffix so drive
  // letters, file URLs, and colons elsewhere in the path are preserved.
  return file.replace(LINE_COLUMN_SUFFIX_RX, '')
}

/**
 * @param {string} fnFile
 * @returns {{ functionName: string, file: string | null }}
 */
function splitFunctionAndFile(fnFile) {
  const separator = fnFile.indexOf(' ')
  if (separator === -1) return { functionName: fnFile, file: null }
  return {
    functionName: fnFile.slice(0, separator),
    file: normalizeFile(fnFile.slice(separator + 1))
  }
}

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
