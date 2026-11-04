'use strict'

const path = require('path')

const { processLogContent, deoptigate } = require('./deoptigate')
const lineReader = require('./lib/line-reader')
const resolveFiles = require('./lib/grouping/resolve-files')
const groupByFile = require('./lib/grouping/group-by-file')

/**
 * @typedef {object} LogOptions
 * @property {boolean} [icStateChangesOnly=true] Keep only inline-cache state changes.
 * @property {string | undefined} [root] Root used to resolve source file paths.
 */

/**
 * @typedef {object} V8DataPoint
 * @property {string} functionName Function name recorded by V8.
 * @property {string | null} file Resolved source file path, or null if unavailable.
 * @property {number} line Source line.
 * @property {number} column Source column.
 * @property {number} [id] Group-local data point identifier.
 * @property {Record<string, unknown>[]} updates Event-specific update records.
 */

/**
 * @typedef {{ics: V8DataPoint[], deopts: V8DataPoint[], codes: V8DataPoint[], root: string}} DeoptProcessorResult
 * @typedef {import('./lib/grouping/group-by-file').FileGroup<V8DataPoint>} FileGroup
 * @typedef {{functionName: string, line: number, column: number}} GroupedDataPoint
 * @typedef {V8DataPoint & GroupedDataPoint} EnrichedDataPoint
 * @typedef {FileGroup} EnrichedFileGroup
 * @typedef {{ics: Map<string, GroupedDataPoint>, deopts: Map<string, GroupedDataPoint>, codes: Map<string, GroupedDataPoint>, icLocations: string[], deoptLocations: string[], codeLocations: string[]}} LocatedFileGroup
 */

/**
 * @typedef {object} ParsedLog
 * @property {() => DeoptProcessorResult} toObject
 * @property {() => void} filterIcStateChanges
 */

/**
 * Read and parse a V8 log into its processor data.
 * @param {string} p Path to the log file.
 * @param {LogOptions} options Parsing options.
 * @returns {Promise<ParsedLog>}
 */
async function extractDataFromLog (p, { icStateChangesOnly, root }) {
  const lines = await lineReader(p, 'utf-8')
  root = root == null ? path.dirname(p) : root
  const processed = await processLogContent(lines, root)
  if (icStateChangesOnly) processed.filterIcStateChanges()
  return processed
}

/**
 * Parse a V8 log and group its events by resolved source file.
 * @param {string} p Path to the log file.
 * @param {LogOptions} [options]
 * @returns {Promise<Map<string, FileGroup>>}
 */
async function processLog (p, { icStateChangesOnly = true, root } = {}) {
  const extracted = await extractDataFromLog(p, { icStateChangesOnly, root })
  const data = extracted.toObject()
  const files = await resolveFiles(data)
  const groupedByFile = groupByFile(data, files)
  return groupedByFile
}

/**
 * Parse a V8 log and serialize its file groups as JSON.
 * @param {string} p Path to the log file.
 * @param {LogOptions} [options]
 * @returns {Promise<string>} Pretty-printed JSON representation.
 */
async function logToJSON (p, { icStateChangesOnly = true, root } = {}) {
  const groupedByFile = await processLog(p, { icStateChangesOnly, root })
  return JSON.stringify(Array.from(groupedByFile), null, 2)
}

/**
 * Parse a V8 log and group its events by file and source location.
 * @param {string} p Path to the log file.
 * @param {Pick<LogOptions, 'icStateChangesOnly'>} [options]
 * @returns {Promise<Map<string, LocatedFileGroup>>}
 */
async function deoptigateLog (p, { icStateChangesOnly = true } = {}) {
  const groupedByFile = await processLog(p, { icStateChangesOnly })
  return deoptigate(groupedByFile)
}

module.exports = {
  processLog,
  logToJSON,
  deoptigateLog
}
