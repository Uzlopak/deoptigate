'use strict'

const test = require('tape')
const assert = require('../lib/assert')

test('app assert accepts true conditions and rejects false ones', (t) => {
  t.doesNotThrow(() => assert(true), 'accepts a true condition')
  t.throws(() => assert(false, 'custom failure'), /custom failure/,
    'throws the supplied message for a false condition')
  t.throws(() => assert(false), /Assertion failed/,
    'uses a default message when none is supplied')
  t.doesNotThrow(() => assert.equal(1, 1), 'accepts equal values')
  t.throws(() => assert.equal(1, 2, 'values differ'), /values differ/,
    'rejects unequal values')
  t.end()
})
