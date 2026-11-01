'use strict'

const test = require('tape')
const CsvParser = require('../lib/v8-tools-core/csvparser')

test('CsvParser splits V8 records and decodes escaped fields', (t) => {
  const parser = new CsvParser()
  const fields = parser.parseLine('record,a\\\\b,tab\\nline,hex\\x2f,unicode\\u263a,comma\\x2Cinside')

  t.deepEqual(fields, [
      'record'
    , 'a\\b'
    , 'tab\nline'
    , 'hex/'
    , 'unicode☺'
    , 'comma,inside'
  ], 'decodes V8 escapes without splitting escaped commas')
  t.end()
})

test('CsvParser decodes escape boundary values', (t) => {
  const parser = new CsvParser()
  const fields = parser.parseLine(String.raw`\x00,\xFF,\u0000,\uFFFF,\xAf,\uABcd`)

  t.deepEqual(fields, [ '\x00', '\xFF', '\u0000', '\uFFFF', '\xAF', '\uABCD' ], 'decodes full byte and UTF-16 ranges with either hex case')
  t.end()
})

test('CsvParser preserves unknown, invalid and trailing escapes', (t) => {
  const parser = new CsvParser()
  t.equal(parser.escapeField('literal\\q'), 'literal\\q', 'unknown escapes stay literal')
  t.equal(parser.escapeField('invalid\\xZZ'), 'invalid\\xZZ', 'invalid hex escapes stay literal')
  t.equal(parser.escapeField(String.raw`short-hex-\x2`), String.raw`short-hex-\x2`, 'incomplete hex escapes stay literal')
  t.equal(parser.escapeField(String.raw`short-unicode-\u12`), String.raw`short-unicode-\u12`, 'incomplete Unicode escapes stay literal')
  t.equal(parser.escapeField(String.raw`invalid-unicode-\uZZZZ`), String.raw`invalid-unicode-\uZZZZ`, 'invalid Unicode escapes stay literal')
  t.equal(parser.escapeField('trailing\\'), 'trailing\\', 'trailing backslash stays literal')
  t.end()
})

test('CsvParser continues decoding adjacent escapes', (t) => {
  const parser = new CsvParser()
  const decoded = parser.escapeField(String.raw`\x2C\\`)

  t.deepEqual(Array.from(decoded, character => character.charCodeAt(0)), [ 44, 92 ], 'decodes escaped comma followed by escaped backslash')
  t.end()
})

test('CsvParser handles empty records and empty fields', (t) => {
  const parser = new CsvParser()
  t.deepEqual(parser.parseLine(''), [], 'empty records have no fields')
  t.deepEqual(parser.parseLine(',value,'), [ '', 'value', '' ], 'retains empty fields')
  t.end()
})
