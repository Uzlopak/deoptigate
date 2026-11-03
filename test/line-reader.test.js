'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('node:test')

const lineReader = require('../lib/line-reader')

test('lineReader yields complete and final UTF-8 lines and handles empty files', async (/** @type {import('node:test').TestContext} */ t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deoptigate-line-reader-'))
  const populatedPath = path.join(dir, 'populated.log')
  const emptyPath = path.join(dir, 'empty.log')
  const boundaryPath = path.join(dir, 'boundary.log')
  t.plan(5)

  try {
    fs.writeFileSync(populatedPath, 'first line\nzweite Zeile ä\nlast line')
    fs.writeFileSync(emptyPath, '')
    // In UTF-8, the first byte of "é" lands at the end of the first chunk.
    fs.writeFileSync(boundaryPath, 'abcdé\nlast')

    const lines = []
    for await (const line of lineReader(populatedPath, 'utf8')) lines.push(line)
    t.assert.deepEqual(lines, [ 'first line', 'zweite Zeile ä', 'last line' ], 'final unterminated line is yielded')

    const emptyLines = []
    for await (const line of lineReader(emptyPath, 'utf8')) emptyLines.push(line)
    t.assert.deepEqual(emptyLines, [], 'empty files yield no lines')

    const boundaryLines = []
    for await (const line of lineReader(boundaryPath, 'utf8', { maxBufferSize: 5 })) boundaryLines.push(line)
    t.assert.deepEqual(boundaryLines, [ 'abcdé', 'last' ], 'decodes a multibyte character split across chunks')

    let readCalls = 0
    const noReadLines = []
    for await (const line of lineReader(populatedPath, 'utf8', {
      maxBufferSize: 4,
      readChunk: async (fd, buffer) => {
        readCalls++
        return { bytesRead: 0, buffer }
      }
    })) noReadLines.push(line)
    t.assert.equal(readCalls, 1, 'stops after a defensive zero-byte read')
    t.assert.deepEqual(noReadLines, [], 'a zero-byte read yields no lines')
  } finally {
    fs.unlinkSync(populatedPath)
    fs.unlinkSync(emptyPath)
    fs.unlinkSync(boundaryPath)
    fs.rmdirSync(dir)
  }
})

test('lineReader rejects invalid chunk sizes before opening the file', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  for (const maxBufferSize of [ 0, -1, 1.5, NaN ]) {
    let error
    try {
      for await (const line of lineReader('/missing/path', 'utf8', { maxBufferSize })) {
        t.assert.fail(`unexpected line: ${line}`)
      }
    } catch (err) {
      error = err
    }
    t.assert.ok(error instanceof RangeError, `rejects chunk size ${maxBufferSize}`)
  }
})
