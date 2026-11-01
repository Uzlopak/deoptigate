'use strict'

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

assert.equal = function(actual, expected, message) {
  assert(actual === expected, message)
}

module.exports = assert
