'use strict'

const { severityOfOptimizationState }  = require('./optimization-state')

const LINE_COLUMN_SUFFIX_RX = /:\d+:\d+$/

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

/**
 * Remove the line and column suffix Node.js appends to code file paths.
 *
 * @param {string} file
 * @returns {string}
 */
function normalizeFile(file) {
  // Node.js adds :line:column to the end. Remove only that suffix so drive
  // letters, file URLs, and colons elsewhere in the path are preserved.
  return file.replace(LINE_COLUMN_SUFFIX_RX, '')
}

/**
 * Split V8's function-and-file description into its two parts.
 *
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
