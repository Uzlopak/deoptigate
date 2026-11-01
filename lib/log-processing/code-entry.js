'use strict'

const { severityOfOptimizationState }  = require('./optimization-state')

function normalizeFile(file) {
  // Node.js adds :line:column to the end. Remove only that suffix so drive
  // letters, file URLs, and colons elsewhere in the path are preserved.
  return file.replace(/:\d+:\d+$/, '')
}

function splitFunctionAndFile(fnFile) {
  const separator = fnFile.indexOf(' ')
  if (separator === -1) return { functionName: fnFile, file: null }
  return {
    functionName: fnFile.slice(0, separator),
    file: normalizeFile(fnFile.slice(separator + 1))
  }
}

class CodeEntry {
  constructor({ fnFile, line, column, isScript }) {
    const { functionName, file } = splitFunctionAndFile(fnFile)
    this._functionName = functionName
    this._file = file
    this._line = line
    this._column = column
    this._isScript = isScript

    this.updates = []
  }

  addUpdate(timestamp, state) {
    const severity = severityOfOptimizationState(state)
    this.updates.push({ timestamp, state, severity })
  }

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
