'use strict'

const { test } = require('node:test')
const assert = require('../lib/assert')

test('app assert accepts true conditions and rejects false ones', (t) => {
  t.plan(5)
  t.assert.doesNotThrow(() => assert(true), 'accepts a true condition')
  t.assert.throws(() => assert(false, 'custom failure'), /custom failure/,
    'throws the supplied message for a false condition')
  t.assert.throws(() => assert(false), /Assertion failed/,
    'uses a default message when none is supplied')
  t.assert.doesNotThrow(() => assert.equal(1, 1), 'accepts equal values')
  t.assert.throws(() => assert.equal(1, 2, 'values differ'), /values differ/,
    'rejects unequal values')
})
