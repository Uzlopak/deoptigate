'use strict'

const { promisify } = require('util')
const fs = require('fs')
const { StringDecoder } = require('string_decoder')

const open = promisify(fs.open)
const fstat = promisify(fs.fstat)
const read = promisify(fs.read)
const close = promisify(fs.close)

const _50_MEGABYTES = 50 * 1024 * 1024
/**
 * @typedef {Object} LineReaderOptions
 * @property {number} [maxBufferSize] Maximum number of bytes read at once.
 * @property {(fd: number, buffer: Buffer, offset: number, length: number, position: number) => Promise<{bytesRead: number, buffer: Buffer}>} [readChunk]
 */

/**
 * Read a file incrementally and yield its lines.
 * @param {string} path File path to read.
 * @param {BufferEncoding} encoding Encoding used to decode the file.
 * @param {LineReaderOptions} [options]
 * @returns {AsyncGenerator<string, void, unknown>}
 */
async function * lineReader (path, encoding, options = {}) {
  const {
    maxBufferSize = _50_MEGABYTES,
    readChunk = read
  } = options
  if (!Number.isInteger(maxBufferSize) || maxBufferSize <= 0) {
    throw new RangeError('maxBufferSize must be a positive integer')
  }

  const fd = await open(path, 'r')
  const decoder = new StringDecoder(encoding)
  let remainingString = ''

  try {
    const stats = await fstat(fd)
    const fileSize = stats.size
    let position = 0

    while (position < fileSize) {
      const bufferSize = Math.min(maxBufferSize, fileSize - position)
      const buffer = Buffer.alloc(bufferSize)
      const chunk = await readChunk(fd, buffer, 0, bufferSize, position)
      if (chunk.bytesRead === 0) break
      position += chunk.bytesRead

      const contents = remainingString + decoder.write(buffer.subarray(0, chunk.bytesRead))
      let current = 0
      let next
      while ((next = contents.indexOf('\n', current)) !== -1) {
        yield contents.slice(current, next)
        current = next + 1
      }
      remainingString = contents.slice(current)
    }

    remainingString += decoder.end()
    if (remainingString.length > 0) yield remainingString
  } finally {
    await close(fd)
  }
}

module.exports = lineReader
