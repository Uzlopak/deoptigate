'use strict'

/**
 * Throws when the condition is falsy.
 * @param {unknown} condition
 * @param {string} [message]
 * @returns {asserts condition}
 */
function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

/** @type {(actual: unknown, expected: unknown, message?: string) => void} */
assert.equal = function(actual, expected, message) {
  assert(actual === expected, message)
}

module.exports = assert
