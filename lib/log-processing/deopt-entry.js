'use strict'

/* eslint-disable camelcase */

const { MIN_SEVERITY } = require('../severities')

// <../examples/adders.js:93:27
const sourcePositionRx = /<(.+):(\d+):(\d+)>/
const STARTING_QUOTE_RX = /^"/
const ENDING_QUOTE_RX = /"$/
const DEOPT_PREFIX_RX = /^deopt-/

function safeToInt(x) {
  return parseInt(x)
}

const SOFT = MIN_SEVERITY
const LAZY = MIN_SEVERITY + 1
const EAGER = MIN_SEVERITY + 2

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

function unquote(s) {
  // for some reason Node.js double quotes the string, i.e. ""eager""
  return s.replace(STARTING_QUOTE_RX, '').replace(ENDING_QUOTE_RX, '')
}

class DeoptEntry {
  constructor(
      fnFile
    , file
    , line
    , column
  ) {
    const parts = fnFile.split(' ')
    const functionName = parts[0]

    this.functionName = functionName
    this.file = file
    this.line = line
    this.column = column

    this.updates = []
  }

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

  get hashmap() {
    return {
        functionName : this.functionName
      , file         : this.file
      , line         : this.line
      , column       : this.column
      , updates      : this.updates
    }
  }

  static disassembleSourcePosition(sourcePosition) {
    const m = sourcePositionRx.exec(sourcePosition)
    if (m == null) return { file: null, line: 0, column: 0 }
    return { file: m[1], line: safeToInt(m[2]), column: safeToInt(m[3]) }
  }
}

module.exports = DeoptEntry
