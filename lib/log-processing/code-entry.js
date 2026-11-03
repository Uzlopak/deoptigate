'use strict'

const { severityOfOptimizationState }  = require('./optimization-state')
const { splitFunctionAndFile } = require('./function-file')

/** @typedef {{ timestamp: number, state: import('./optimization-state').ParsedOptimizationState, severity: import('../severities').Severity }} CodeUpdate */

/**
 * @typedef {object} CodeEntryHashmap
 * @property {string} functionName
 * @property {string | null} file
 * @property {number} line
 * @property {number} column
 * @property {boolean} isScript
 * @property {CodeUpdate[]} updates
 */

class CodeEntry {
  /**
   * @param {{ fnFile: string, line: number, column: number, isScript: boolean }} entry
   */
  constructor({ fnFile, line, column, isScript }) {
    const { functionName, file } = splitFunctionAndFile(fnFile)
    this._functionName = functionName
    this._file = file
    this._line = line
    this._column = column
    this._isScript = isScript

    /** @type {CodeUpdate[]} */
    this.updates = []
  }

  /**
   * Record an optimization-state update.
   *
   * @param {number} timestamp
   * @param {import('./optimization-state').ParsedOptimizationState} state
   * @returns {void}
   */
  addUpdate(timestamp, state) {
    const severity = severityOfOptimizationState(state)
    this.updates.push({ timestamp, state, severity })
  }

  /** @returns {CodeEntryHashmap} */
  get hashmap() {
    return {
        functionName: this._functionName
      , file: this._file
      , line: this._line
      , column: this._column
      , isScript: this._isScript
      , updates: this.updates
    }
  }
}

module.exports = CodeEntry
