'use strict'

const LINE_COLUMN_SUFFIX_RX = /:\d+:\d+$/
const SOURCE_PATH_START_RX = /\s(?=(?:[A-Za-z]:[\\/]|\\\\|\/|file:\/\/|node:|\[eval\]|<anonymous>|[^/\\\s]+[\\/]))/
const RELATIVE_SOURCE_FILENAME_RX = /\s(?=[^/\\\s]+\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)(?::\d+:\d+)?$)/

/**
 * Remove the line and column suffix Node.js appends to source paths.
 *
 * @param {string} file
 * @returns {string}
 */
function normalizeFile(file) {
  return file.replace(LINE_COLUMN_SUFFIX_RX, '')
}

/**
 * Split a V8 function description into its function name and source path.
 *
 * V8 can include spaces in both values. Absolute paths, relative paths with
 * directory separators, and common virtual source names provide a recognizable
 * boundary. Bare relative JavaScript and TypeScript filenames are recognized
 * by their extension. Other names use the original first-space fallback
 * because their boundary is ambiguous.
 *
 * @param {string} fnFile
 * @returns {{ functionName: string, file: string | null }}
 */
function splitFunctionAndFile(fnFile) {
  const sourcePathStart = SOURCE_PATH_START_RX.exec(fnFile)
  const relativeFilenameStart = RELATIVE_SOURCE_FILENAME_RX.exec(fnFile)
  const separator = sourcePathStart?.index ?? relativeFilenameStart?.index ?? fnFile.indexOf(' ')
  if (separator === -1) return { functionName: fnFile, file: null }

  return {
    functionName: fnFile.slice(0, separator),
    file: normalizeFile(fnFile.slice(separator + 1))
  }
}

module.exports = { normalizeFile, splitFunctionAndFile }
