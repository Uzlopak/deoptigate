'use strict'

const newUpdateList = require('./new-update-list')
const {
  parseIcState,
  severityIcState
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
function unquote (s) {
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
// These records outlive many collections, so as object literals V8 eventually
// pretenures their allocation site, which deoptimizes all code that allocates
// there. Instances of a class aren't tracked by allocation site.
class IcUpdateRecord {
  /**
   * @param {string} type
   * @param {IcUpdate['oldState']} oldState
   * @param {IcUpdate['newState']} newState
   * @param {string} key
   * @param {string} map
   * @param {import('./optimization-state').OptimizationState} optimizationState
   * @param {IcUpdate['severity']} severity
   */
  constructor (type, oldState, newState, key, map, optimizationState, severity) {
    this.type = type
    this.oldState = oldState
    this.newState = newState
    this.key = key
    this.map = map
    this.optimizationState = optimizationState
    this.severity = severity
  }
}

class IcHashmap {
  /** @param {IcEntry} entry */
  constructor (entry) {
    this.functionName = entry.functionName
    this.file = entry.file
    this.line = entry.line
    this.column = entry.column
    this.updates = entry.updates
  }
}

class IcEntry {
  /**
   * @param {string} fnFile
   * @param {number} line
   * @param {number} column
   */
  constructor (
    fnFile,
    line,
    column
  ) {
    fnFile = unquote(fnFile)
    const { functionName, file } = splitFunctionAndFile(fnFile)

    this.functionName = functionName
    this.file = file
    this.line = line
    this.column = column
    /** @type {IcUpdate[]} */
    this.updates = newUpdateList()
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
  addUpdate (type, oldState, newState, key, map, optimizationState) {
    const mapHex = map.toString(16)
    const oldStateId = parseIcState(/** @type {IcStateCode} */ (oldState))
    const newStateId = parseIcState(/** @type {IcStateCode} */ (newState))
    const severity = severityIcState(newStateId)

    this.updates.push(new IcUpdateRecord(type, oldStateId, newStateId, key, mapHex, optimizationState, severity))
  }

  /** Keep only updates where the inline cache state changed. @returns {void} */
  filterIcStateChanges () {
    this.updates = this.updates.filter(x => x.oldState !== x.newState)
  }

  /** @returns {{ functionName: string, file: string | null, line: number, column: number, updates: IcUpdate[] }} */
  get hashmap () {
    return new IcHashmap(this)
  }
}

module.exports = IcEntry
