'use strict'

/**
 * @typedef {object} JsonlEvent
 * @property {string | null} file
 * @property {string} functionName
 * @property {number} line
 * @property {number} column
 * @property {Record<string, unknown>[]} updates
 */

/**
 * @typedef {object} JsonlFileInfo
 * @property {string} fullPath
 * @property {string} relativePath
 * @property {string} src
 * @property {JsonlEvent[]} ics
 * @property {JsonlEvent[]} deopts
 * @property {JsonlEvent[]} codes
 */

/**
 * Serialize one self-describing JSON object per source file.
 * Source text and repeated event file paths are omitted to reduce prompt size.
 * @param {Map<string, JsonlFileInfo>} report
 * @returns {string} JSON Lines data with a trailing newline when nonempty.
 */
function toJsonl(report) {
  /** @type {string[]} */
  const lines = []
  for (const [file, info] of report) {
    const record = {
        file
      , relativePath: info.relativePath
      , ics: withoutEventFiles(info.ics)
      , deopts: withoutEventFiles(info.deopts)
      , codes: withoutEventFiles(info.codes)
    }
    lines.push(JSON.stringify(record))
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

/**
 * @param {JsonlEvent[]} events
 * @returns {Omit<JsonlEvent, 'file'>[]}
 */
function withoutEventFiles(events) {
  /** @type {Omit<JsonlEvent, 'file'>[]} */
  const result = []
  for (const event of events) {
    const { file: _file, ...data } = event
    result.push(data)
  }
  return result
}

module.exports = toJsonl
