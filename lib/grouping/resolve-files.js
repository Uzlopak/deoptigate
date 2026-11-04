'use strict'

const path = require('path')
const { promisify } = require('util')
const fs = require('fs')
const { fileURLToPath } = require('url')
const readFile = promisify(fs.readFile)
const stat = promisify(fs.stat)
const access = promisify(fs.access)
const FILE_URL_PREFIX = 'file://'

/**
 * Check whether the current process can read a path.
 *
 * @param {string} p
 * @returns {Promise<boolean>}
 */
async function canRead(p) {
  try {
    await access(p, fs.constants.R_OK)
    return true
  } catch (err) {
    return false
  }
}

/**
 * Convert a source reference to an absolute path. ES modules are reported as
 * file URLs, which `path.resolve` would treat as relative paths.
 *
 * @param {string} key
 * @param {string} root
 * @returns {string | null} The path, or null for an unusable file URL.
 */
function toFullPath(key, root) {
  if (!key.startsWith(FILE_URL_PREFIX)) return path.resolve(root, key)
  try {
    return fileURLToPath(key)
  } catch (err) {
    return null
  }
}

/**
 * Read each readable regular file in a set of root-relative paths or file URLs.
 *
 * @param {Set<string>} set
 * @param {string} root
 * @returns {Promise<Map<string, { fullPath: string, relativePath: string, src: string }>>}
 */
async function resolveAll(set, root) {
  const files = new Map()
  for (const key of set) {
    const fullPath = toFullPath(key, root)
    if (fullPath == null || !(await canRead(fullPath))) continue
    const relativePath = path.relative(root, fullPath)
    if (!(await stat(fullPath)).isFile()) continue
    const src = await readFile(fullPath, 'utf8')
    files.set(key, { fullPath, relativePath, src })
  }
  return files
}

/** @typedef {{ file: string | null | undefined }} FileLocation */

/**
 * Resolve source files referenced by IC, deoptimization, and code entries.
 * Missing, unreadable, and non-file paths are omitted from the result.
 *
 * @param {{
 *   ics: FileLocation[],
 *   deopts: FileLocation[],
 *   codes: FileLocation[],
 *   root: string
 * }} data
 * @returns {Promise<Map<string, { fullPath: string, relativePath: string, src: string }>>}
 */
async function resolveFiles(data) {
  const { ics, deopts, codes, root } = data

  const filesSet = new Set(
    ics.map(x => x.file)
      .concat(deopts.map(x => x.file))
      .concat(codes.map(x => x.file))
      .filter(/** @returns {file is string} */ file => typeof file === 'string')
  )
  const files = await resolveAll(filesSet, root)
  return files
}

module.exports = resolveFiles
