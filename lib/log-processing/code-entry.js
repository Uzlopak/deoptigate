'use strict'

const newUpdateList = require('./new-update-list')
const { severityOfOptimizationState } = require('./optimization-state')
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

// These records outlive many collections, so as object literals V8 eventually
// pretenures their allocation site, which deoptimizes all code that allocates
// there. Instances of a class aren't tracked by allocation site.
class CodeUpdateRecord {
  /**
   * @param {number} timestamp
   * @param {import('./optimization-state').ParsedOptimizationState} state
   * @param {CodeUpdate['severity']} severity
   */
  constructor (timestamp, state, severity) {
    this.timestamp = timestamp
    this.state = state
    this.severity = severity
  }
}

class CodeHashmap {
  /** @param {CodeEntry} entry */
  constructor (entry) {
    this.functionName = entry._functionName
    this.file = entry._file
    this.line = entry._line
    this.column = entry._column
    this.isScript = entry._isScript
    this.updates = entry.updates
  }
}

class CodeEntry {
  /**
   * @param {{ fnFile: string, line: number, column: number, isScript: boolean }} entry
   */
  constructor ({ fnFile, line, column, isScript }) {
    const { functionName, file } = splitFunctionAndFile(fnFile)
    this._functionName = functionName
    this._file = file
    this._line = line
    this._column = column
    this._isScript = isScript

    /** @type {CodeUpdate[]} */
    this.updates = newUpdateList()
  }

  /**
   * Record an optimization-state update.
   *
   * @param {number} timestamp
   * @param {import('./optimization-state').ParsedOptimizationState} state
   * @returns {void}
   */
  addUpdate (timestamp, state) {
    const severity = severityOfOptimizationState(state)
    this.updates.push(new CodeUpdateRecord(timestamp, state, severity))
  }

  /** @returns {CodeEntryHashmap} */
  get hashmap () {
    return new CodeHashmap(this)
  }
}

module.exports = CodeEntry
