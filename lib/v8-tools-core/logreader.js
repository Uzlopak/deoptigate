// Copyright 2011 the V8 project authors. All rights reserved.
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above
//       copyright notice, this list of conditions and the following
//       disclaimer in the documentation and/or other materials provided
//       with the distribution.
//     * Neither the name of Google Inc. nor the names of its
//       contributors may be used to endorse or promote products derived
//       from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

/**
 * @fileoverview Log Reader is used to process log file produced by V8.
 */

/** @typedef {string | number} LogFieldValue */
/** @typedef {(field: string) => LogFieldValue} LogFieldParser */
/** @typedef {LogFieldParser | null | 'var-args'} LogParser */

/**
 * @typedef {object} LogDispatch
 * @property {LogParser[]} parsers Parsers for fixed fields, or the var-args marker.
 * @property {(...args: never[]) => void} processor Handler for heterogeneous parsed fields.
 */

/**
 * @typedef {object} LogReaderState
 * @property {Map<string, LogDispatch | null>} dispatchTable_
 * @property {boolean} timedRange_
 * @property {boolean} pairwiseTimedRange_
 * @property {number} lineNum_
 * @property {CsvParser} csvParser_
 * @property {boolean} hasSeenTimerMarker_
 * @property {string[]} logLinesSinceLastTimerMarker_
 * @property {string} pendingLogLine_
 * @property {(message: string) => void} printError
 * @property {(dispatch: LogDispatch) => boolean} skipDispatch
 * @property {(fields: string[]) => void} dispatchLogRow_
 * @property {(lines: string[]) => void} processLog_
 * @property {(chunk: string) => void} processLogChunk
 * @property {() => void} processLogEnd
 * @property {(line: string) => void} processLogLine
 * @property {(pc: number, func: number, stack: string[]) => number[]} processStack
 */

/**
 * Base class for processing log files.
 *
 * @param {Map<string, LogDispatch | null>} dispatchTable A table used for
 *     parsing and processing log records. A Map because a keyed property load
 *     speculates on the first command it sees and deoptimizes on the next one.
 * @param {boolean} timedRange Ignore ticks outside timed range.
 * @param {boolean} pairwiseTimedRange Ignore ticks outside pairs of timer
 *     markers.
 * @this {LogReaderState}
 * @constructor
 */
function LogReader (dispatchTable, timedRange, pairwiseTimedRange) {
  /**
   * @type {Map<string, LogDispatch | null>}
   */
  this.dispatchTable_ = dispatchTable

  /**
   * @type {boolean}
   */
  this.timedRange_ = timedRange

  /**
   * @type {boolean}
   */
  this.pairwiseTimedRange_ = pairwiseTimedRange
  if (pairwiseTimedRange) {
    this.timedRange_ = true
  }

  /**
   * Current line.
   * @type {number}
   */
  this.lineNum_ = 0

  /**
   * CSV lines parser.
   * @type {CsvParser}
   */
  this.csvParser_ = new CsvParser()

  /**
   * Keeps track of whether we've seen a "current-time" tick yet.
   * @type {boolean}
   */
  this.hasSeenTimerMarker_ = false

  /**
   * List of log lines seen since last "current-time" tick.
   * @type {string[]}
   */
  this.logLinesSinceLastTimerMarker_ = []

  /** @type {string} */
  this.pendingLogLine_ = ''
};

/**
 * Used for printing error messages.
 *
 * @param {string} str Error message.
 * @this {LogReaderState}
 */
LogReader.prototype.printError = function (str) {
  // Do nothing.
}

/**
 * Processes a portion of V8 profiler event log.
 *
 * @param {string} chunk A portion of log.
 * @this {LogReaderState}
 */
LogReader.prototype.processLogChunk = function (chunk) {
  const lines = (this.pendingLogLine_ + chunk).split('\n')
  this.pendingLogLine_ = lines.pop() || ''
  this.processLog_(lines)
}

/**
 * Process the final unterminated line after the last chunk has been received.
 * @this {LogReaderState}
 */
LogReader.prototype.processLogEnd = function () {
  if (this.pendingLogLine_ === '') return
  const finalLine = this.pendingLogLine_
  this.pendingLogLine_ = ''
  this.processLogLine(finalLine)
}

/**
 * Processes a line of V8 profiler event log.
 *
 * @param {string} line A line of log.
 * @this {LogReaderState}
 */
LogReader.prototype.processLogLine = function (line) {
  if (!this.timedRange_) {
    this.processLog_([line])
    return
  }
  if (line.startsWith('current-time')) {
    if (this.hasSeenTimerMarker_) {
      this.processLog_(this.logLinesSinceLastTimerMarker_)
      this.logLinesSinceLastTimerMarker_ = []
      // In pairwise mode, a "current-time" line ends the timed range.
      if (this.pairwiseTimedRange_) {
        this.hasSeenTimerMarker_ = false
      }
    } else {
      this.hasSeenTimerMarker_ = true
    }
  } else {
    if (this.hasSeenTimerMarker_) {
      this.logLinesSinceLastTimerMarker_.push(line)
    } else if (!line.startsWith('tick')) {
      this.processLog_([line])
    }
  }
}

/**
 * Processes stack record.
 *
 * @param {number} pc Program counter.
 * @param {number} func JS function address.
 * @param {string[]} stack String representation of a stack.
 * @return {number[]} Processed stack.
 * @this {LogReaderState}
 */
LogReader.prototype.processStack = function (pc, func, stack) {
  const fullStack = func ? [pc, func] : [pc]
  let prevFrame = pc
  for (let i = 0, n = stack.length; i < n; ++i) {
    const frame = stack[i]
    const firstChar = frame.charAt(0)
    if (firstChar == '+' || firstChar == '-') {
      // An offset from the previous frame.
      prevFrame += parseInt(frame, 16)
      fullStack.push(prevFrame)
    // Filter out possible 'overflow' string.
    } else if (firstChar != 'o') {
      fullStack.push(parseInt(frame, 16))
    } else {
      this.printError('dropping: ' + frame)
    }
  }
  return fullStack
}

/**
 * Returns whether a particular dispatch must be skipped.
 *
 * @param {LogDispatch} dispatch Dispatch record.
 * @return {boolean} True if dispatch must be skipped.
 * @this {LogReaderState}
 */
LogReader.prototype.skipDispatch = function (dispatch) {
  return false
}

/**
 * Does a dispatch of a log record.
 *
 * @param {string[]} fields Log record.
 * @this {LogReaderState}
 * @private
 */
LogReader.prototype.dispatchLogRow_ = function (fields) {
  // Obtain the dispatch.
  const dispatch = this.dispatchTable_.get(fields[0])

  if (dispatch == null || this.skipDispatch(dispatch)) {
    return
  }

  // Parse fields.
  /** @type {Array<LogFieldValue | string[]>} */
  const parsedFields = []
  for (let i = 0; i < dispatch.parsers.length; ++i) {
    const parser = dispatch.parsers[i]
    if (parser === null) {
      parsedFields.push(fields[1 + i])
    } else if (typeof parser === 'function') {
      parsedFields.push(parser(fields[1 + i]))
    } else {
      // var-args
      parsedFields.push(fields.slice(1 + i))
      break
    }
  }

  // Run the processor.
  Reflect.apply(dispatch.processor, this, parsedFields)
}

/**
 * Processes log lines.
 *
 * @param {string[]} lines Log lines.
 * @private
 * @this {LogReaderState}
 */
LogReader.prototype.processLog_ = function (lines) {
  for (let i = 0, n = lines.length; i < n; ++i, ++this.lineNum_) {
    let line = lines[i]
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (!line) {
      continue
    }
    const separator = line.indexOf(',')
    const command = separator === -1 ? line : line.slice(0, separator)
    if (!this.dispatchTable_.has(command)) {
      continue
    }
    try {
      const fields = this.csvParser_.parseLine(line)
      this.dispatchLogRow_(fields)
    } catch (e) {
      const error = /** @type {Error} */ (e)
      this.printError('line ' + (this.lineNum_ + 1) + ': ' + (error.message || error))
    }
  }
}

if (typeof module === 'object' && typeof module.exports === 'object') {
  var CsvParser = require('./csvparser.js')
  /** @type {new (dispatchTable?: Map<string, LogDispatch | null>, timedRange?: boolean, pairwiseTimedRange?: boolean) => LogReaderState} */
  const LogReaderConstructor = /** @type {new (dispatchTable?: Map<string, LogDispatch | null>, timedRange?: boolean, pairwiseTimedRange?: boolean) => LogReaderState} */ (
    /** @type {unknown} */ (LogReader)
  )
  module.exports = LogReaderConstructor
}
