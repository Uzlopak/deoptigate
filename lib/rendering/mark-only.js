'use strict'

const escapeHtml = require('./escape-html')
const { getDigits, pad } = require('./line-number')

function insertMarker(line, markerResolver, next, column, writtenCols) {
  const { insertBefore, insertAfter } = markerResolver.resolve(next)
  // Write char in column only once even if multiple markers exist for it
  const rendered = writtenCols.has(column)
    ? insertBefore + insertAfter
    : insertBefore + escapeHtml(line[column]) + insertAfter
  writtenCols.add(column)
  return { rendered, nextLocation: markerResolver.nextLocation() }
}

function processLine(line, markerResolver, next, lineno, totalDigits) {
  let s = ''
  let column = 0
  const cols = line.length - 1
  const writtenCols = new Set()
  do {
    // Work our way to the column of the next marker
    while (column < (next.column - 1) && column < cols) {
      s += escapeHtml(line[column++])
      if (column >= cols) break
    }
    const inserted = insertMarker(line, markerResolver, next, column, writtenCols)
    s += inserted.rendered
    next = inserted.nextLocation
  } while (next != null && next.line === lineno + 1 && column < cols)

  // Add remaining columns (after the last marker for this line)
  if (column < cols) s += escapeHtml(line.slice(column + 1))

  return { renderedLine: `<span>${pad(lineno + 1, totalDigits)}: </span><span>${s}</span><br>`, nextLocation: next }
}

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
