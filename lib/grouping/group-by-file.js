'use strict'

const path = require('path')

const legacySpawnPreloadRx = /ispawn[\\/]preload[\\/]\S+\.js$/
// Match this package's own preloads exactly, so a profiled project's files with
// the same names stay in its report.
const spawnPreloads = new Set([
  path.join(__dirname, '../../bin/soft-exit.js'),
  path.join(__dirname, '../../src/injects/soft-exit.js'),
  path.join(__dirname, '../../src/injects/detect-port.js')
])

/** @typedef {{ file: string | null }} FileDataPoint */
/** @typedef {{ fullPath: string, relativePath: string, src: string }} ResolvedFile */
/**
 * @template {FileDataPoint} [T=FileDataPoint]
 * @typedef {{ ics: T[], deopts: T[], codes: T[] } & ResolvedFile} FileGroup<T>
 */
/** @typedef {'ics' | 'deopts' | 'codes'} FileGroupKey */

/**
 * @param {Map<string, ResolvedFile>} files
 * @param {string | null | undefined} file
 * @returns {boolean}
 */
function ignoreFile (files, file) {
  // For now we only include user code for which we resolved the file
  // Keep logs free of child-process helpers, including legacy ispawn preloads.
  return file == null || !files.has(file) || spawnPreloads.has(file) || legacySpawnPreloadRx.test(file)
}

/**
 * @param {Map<string, ResolvedFile>} files
 * @template {FileDataPoint} T
 * @param {Map<string, FileGroup<T>>} groups
 * @param {string} file
 * @returns {FileGroup<T>}
 */
function getOrCreateFileGroup (files, groups, file) {
  const existing = groups.get(file)
  if (existing != null) return existing
  const resolvedFile = /** @type {ResolvedFile} */ (files.get(file))
  const group = Object.assign({ ics: [], deopts: [], codes: [] }, resolvedFile)
  groups.set(file, group)
  return group
}

/**
 * @template {FileDataPoint} T
 * @param {Map<string, FileGroup<T>>} groups
 * @param {Map<string, ResolvedFile>} files
 * @param {T[]} dataPoints
 * @param {FileGroupKey} key
 * @returns {void}
 */
function handleDataPoints (groups, files, dataPoints, key) {
  for (const dataPoint of dataPoints) {
    const { file } = dataPoint
    if (file == null || ignoreFile(files, file)) continue
    const group = getOrCreateFileGroup(files, groups, file)
    group[key].push(dataPoint)
  }
}

/**
 * Group inline-cache, deoptimization, and code data points by resolved file.
 *
 * @template {FileDataPoint} T
 * @param {{ ics: T[], deopts: T[], codes: T[] }} data
 * @param {Map<string, ResolvedFile>} files
 * @returns {Map<string, FileGroup<T>>}
 */
function mapByFile (data, files) {
  const { ics, deopts, codes } = data
  const groups = new Map()
  handleDataPoints(groups, files, ics, 'ics')
  handleDataPoints(groups, files, deopts, 'deopts')
  handleDataPoints(groups, files, codes, 'codes')
  return groups
}

module.exports = mapByFile
