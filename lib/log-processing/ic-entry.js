'use strict'

const {
    parseIcState
  , severityIcState
} = require('./ic-state')

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

function unquote(s) {
  // for some reason Node.js double quotes the file names
  return s.replace(/^"/, '').replace(/"$/, '')
}

class IcEntry {
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
    this.updates = []
  }

  addUpdate(type, oldState, newState, key, map, optimizationState) {
    map = map.toString(16)
    oldState = parseIcState(oldState)
    newState = parseIcState(newState)
    const severity = severityIcState(newState)

    this.updates.push({
        type
      , oldState
      , newState
      , key
      , map
      , optimizationState
      , severity
    })
  }

  filterIcStateChanges() {
    this.updates = this.updates.filter(x => x.oldState !== x.newState)
  }

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
