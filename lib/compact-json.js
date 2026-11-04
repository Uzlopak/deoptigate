'use strict'

/**
 * @typedef {object} CompactUpdate
 * @property {number=} timestamp
 * @property {string=} bailoutType
 * @property {string=} deoptReason
 * @property {number=} optimizationState
 * @property {boolean=} inlined
 * @property {number=} severity
 * @property {string=} type
 * @property {number=} oldState
 * @property {number=} newState
 * @property {string=} key
 * @property {string=} map
 * @property {number=} state
 */

/**
 * @typedef {object} CompactEvent
 * @property {string=} functionName
 * @property {number=} line
 * @property {number=} column
 * @property {boolean=} isScript
 * @property {CompactUpdate[]} updates
 */

/**
 * @typedef {object} CompactFileInfo
 * @property {CompactEvent[]} ics
 * @property {CompactEvent[]} deopts
 * @property {CompactEvent[]} codes
 */

/**
 * Convert report data to a compact tuple format for language-model input.
 * Source text and repeated event file paths are omitted. See the README for
 * the tuple field order.
 * @param {Map<string, CompactFileInfo>} report
 * @returns {string} Compact serialized report data.
 */
function compactJson (report) {
  /** @type {unknown[][]} */
  const files = []
  for (const [file, info] of report) {
    const ics = []
    for (const event of info.ics) {
      const updates = []
      for (const update of event.updates) {
        updates.push([
          update.type,
          update.oldState,
          update.newState,
          update.key,
          update.map,
          update.optimizationState,
          update.severity
        ])
      }
      ics.push([event.functionName, event.line, event.column, updates])
    }

    const deopts = []
    for (const event of info.deopts) {
      const updates = []
      for (const update of event.updates) {
        updates.push([
          update.timestamp,
          update.bailoutType,
          update.deoptReason,
          update.optimizationState,
          update.inlined,
          update.severity
        ])
      }
      deopts.push([event.functionName, event.line, event.column, updates])
    }

    const codes = []
    for (const event of info.codes) {
      const updates = []
      for (const update of event.updates) {
        updates.push([update.timestamp, update.state, update.severity])
      }
      codes.push([
        event.functionName,
        event.line,
        event.column,
        Number(event.isScript === true),
        updates
      ])
    }

    files.push([file, ics, deopts, codes])
  }

  return JSON.stringify(files)
}

module.exports = compactJson
