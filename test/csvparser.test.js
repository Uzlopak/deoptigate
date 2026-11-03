'use strict'

const { test } = require('node:test')
const CsvParser = require('../lib/v8-tools-core/csvparser')

test('CsvParser splits V8 records and decodes escaped fields', (t) => {
  t.plan(1)
  const parser = new CsvParser()
  /** @type {string[]} */
  const fields = parser.parseLine('record,a\\\\b,tab\\nline,hex\\x2f,unicode\\u263a,comma\\x2Cinside')

  t.assert.deepEqual(fields, [
      'record'
    , 'a\\b'
    , 'tab\nline'
    , 'hex/'
    , 'unicode☺'
    , 'comma,inside'
  ], 'decodes V8 escapes without splitting escaped commas')
})

test('CsvParser decodes escape boundary values', (t) => {
  t.plan(1)
  const parser = new CsvParser()
  /** @type {string[]} */
  const fields = parser.parseLine(String.raw`\x00,\xFF,\u0000,\uFFFF,\xAf,\uABcd`)

  t.assert.deepEqual(fields, [ '\x00', '\xFF', '\u0000', '\uFFFF', '\xAF', '\uABCD' ], 'decodes full byte and UTF-16 ranges with either hex case')
})

test('CsvParser preserves unknown, invalid and trailing escapes', (t) => {
  t.plan(6)
  const parser = new CsvParser()
  t.assert.equal(parser.escapeField('literal\\q'), 'literal\\q', 'unknown escapes stay literal')
  t.assert.equal(parser.escapeField('invalid\\xZZ'), 'invalid\\xZZ', 'invalid hex escapes stay literal')
  t.assert.equal(parser.escapeField(String.raw`short-hex-\x2`), String.raw`short-hex-\x2`, 'incomplete hex escapes stay literal')
  t.assert.equal(parser.escapeField(String.raw`short-unicode-\u12`), String.raw`short-unicode-\u12`, 'incomplete Unicode escapes stay literal')
  t.assert.equal(parser.escapeField(String.raw`invalid-unicode-\uZZZZ`), String.raw`invalid-unicode-\uZZZZ`, 'invalid Unicode escapes stay literal')
  t.assert.equal(parser.escapeField('trailing\\'), 'trailing\\', 'trailing backslash stays literal')
})

test('CsvParser continues decoding adjacent escapes', (t) => {
  t.plan(1)
  const parser = new CsvParser()
  const decoded = parser.escapeField(String.raw`\x2C\\`)

  t.assert.deepEqual(Array.from(decoded, character => character.charCodeAt(0)), [ 44, 92 ], 'decodes escaped comma followed by escaped backslash')
})

test('CsvParser handles empty records and empty fields', (t) => {
  t.plan(2)
  const parser = new CsvParser()
  t.assert.deepEqual(parser.parseLine(''), [], 'empty records have no fields')
  t.assert.deepEqual(parser.parseLine(',value,'), [ '', 'value', '' ], 'retains empty fields')
})
