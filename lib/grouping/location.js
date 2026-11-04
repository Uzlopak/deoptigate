'use strict'

/**
 * @typedef {object} Location
 * @property {string} functionName
 * @property {number} line
 * @property {number} column
 */

/**
 * Build a stable key from a function name and its source coordinates.
 *
 * @param {Location} location
 * @returns {string}
 */
function keyLocation ({ functionName, line, column }) {
  // need to customize key since Objects get different key
  // per instance even if line + column are the same
  return `${functionName}:${line}:${column}`
}

/**
 * Parse a location key. The function name may itself contain colons, so the
 * source coordinates are read from the right-hand side of the key.
 *
 * @param {string | null | undefined} key
 * @returns {Location | null}
 */
function unkeyLocation (key) {
  if (key == null) return null
  const columnSeparator = key.lastIndexOf(':')
  const lineSeparator = key.lastIndexOf(':', columnSeparator - 1)
  if (lineSeparator === -1) {
    const [functionName, line, column] = key.split(':')
    return { functionName, line: parseInt(line), column: parseInt(column) }
  }
  const functionName = key.slice(0, lineSeparator)
  const line = key.slice(lineSeparator + 1, columnSeparator)
  const column = key.slice(columnSeparator + 1)
  return { functionName, line: parseInt(line), column: parseInt(column) }
}

/**
 * Compare locations by line and then column.
 *
 * @param {Location} a
 * @param {Location} b
 * @returns {-1 | 0 | 1}
 */
function byLocation (a, b) {
  if (a.line < b.line) return -1
  if (a.line > b.line) return 1
  if (a.column < b.column) return -1
  if (a.column > b.column) return 1
  return 0
}

/**
 * Compare serialized location keys by their source coordinates.
 *
 * @param {string} ka
 * @param {string} kb
 * @returns {-1 | 0 | 1}
 */
function byLocationKey (ka, kb) {
  const a = unkeyLocation(ka)
  const b = unkeyLocation(kb)
  if (a == null || b == null) return 0
  return byLocation(a, b)
}

module.exports = {
  keyLocation,
  unkeyLocation,
  byLocation,
  byLocationKey
}
