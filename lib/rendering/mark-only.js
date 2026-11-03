'use strict'

const escapeHtml = require('./escape-html')
const { getDigits, pad } = require('./line-number')

/** @typedef {{line: number, column: number}} MarkLocation */
/**
 * @typedef {Object} MarkResolver
 * @property {(location: MarkLocation) => {insertBefore: string, insertAfter: string}} resolve
 * @property {() => MarkLocation | null} nextLocation
 */

/**
 * @param {string} line
 * @param {MarkResolver} markerResolver
 * @param {MarkLocation} next
 * @param {number} column
 * @param {Set<number>} writtenCols
 * @returns {{rendered: string, nextLocation: MarkLocation | null}}
 */
function insertMarker(line, markerResolver, next, column, writtenCols) {
  const { insertBefore, insertAfter } = markerResolver.resolve(next)
  // Write char in column only once even if multiple markers exist for it
  const rendered = writtenCols.has(column)
    ? insertBefore + insertAfter
    : insertBefore + escapeHtml(line[column]) + insertAfter
  writtenCols.add(column)
  return { rendered, nextLocation: markerResolver.nextLocation() }
}

/**
 * @param {string} line
 * @param {MarkResolver} markerResolver
 * @param {MarkLocation} next
 * @param {number} lineno Zero-based line index.
 * @param {number} totalDigits Width used for the displayed line number.
 * @returns {{renderedLine: string, nextLocation: MarkLocation | null}}
 */
function processLine(line, markerResolver, next, lineno, totalDigits) {
  let s = ''
  let column = 0
  /** @type {MarkLocation | null} */
  let nextLocation = next
  const cols = line.length - 1
  const writtenCols = new Set()
  do {
    // Work our way to the column of the next marker
    while (column < (nextLocation.column - 1) && column < cols) {
      s += escapeHtml(line[column++])
      if (column >= cols) break
    }
    const inserted = insertMarker(line, markerResolver, nextLocation, column, writtenCols)
    s += inserted.rendered
    nextLocation = inserted.nextLocation
  } while (nextLocation != null && nextLocation.line === lineno + 1 && column < cols)

  // Add remaining columns (after the last marker for this line)
  if (column < cols) s += escapeHtml(line.slice(column + 1))

  return { renderedLine: `<span>${pad(lineno + 1, totalDigits)}: </span><span>${s}</span><br>`, nextLocation }
}

/**
 * Render source code with resolved deoptimization markers and line numbers.
 * @param {string} code
 * @param {MarkResolver} markerResolver
 * @returns {string} HTML fragment.
 */
function markOnly(code, markerResolver) {
  const lines = code.split('\n')
  const len = lines.length
  const totalDigits = getDigits(len)
  var result = ''
  let next = markerResolver.nextLocation()
  for (let lineno = 0; lineno < len; lineno++) {
    const line = lines[lineno]
    if (next == null || next.line > (lineno + 1)) {
      result += `<span>${pad(lineno + 1, totalDigits)}: </span><span>${escapeHtml(line)}</span><br>`
      continue
    }
    const { renderedLine, nextLocation } = processLine(line, markerResolver, next, lineno, totalDigits)
    result += renderedLine
    next = nextLocation
  }
  return `<div class="pre"'>${result}</div>`
}

module.exports = markOnly
