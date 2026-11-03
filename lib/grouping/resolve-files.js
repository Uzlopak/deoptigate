'use strict'

const path = require('path')
const { promisify } = require('util')
const fs = require('fs')
const readFile = promisify(fs.readFile)
const stat = promisify(fs.stat)
const access = promisify(fs.access)

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
 * Read each readable regular file in a set of root-relative paths.
 *
 * @param {Set<string>} set
 * @param {string} root
 * @returns {Promise<Map<string, { fullPath: string, relativePath: string, src: string }>>}
 */
async function resolveAll(set, root) {
  const files = new Map()
  for (const key of set) {
    const fullPath = path.resolve(root, key)
    const relativePath = path.relative(root, fullPath)
    if (!(await canRead(fullPath))) continue
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
