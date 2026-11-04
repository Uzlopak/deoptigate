'use strict'

const { processLog } = require('../deoptigate.log')
const compactJson = require('../lib/compact-json')
const toJsonl = require('../lib/jsonl')

const createPage = require('../app/lib/create-page')
const { savePage, saveEntry, saveJson } = require('../app/lib/save-parts')

/** @typedef {import('../lib/severities').Severity} Severity */
/** @typedef {'opt' | 'deopt' | 'ic'} EventType */

/**
 * Generate the browser report files for a V8 log.
 * @param {string} v8log Path to the V8 log file.
 * @param {string} head Display name used in the success message.
 * @param {'html' | 'json' | 'compact_json' | 'jsonl'} [format='html'] Report output format.
 * @param {string} [fileNameFilter] Case-sensitive substring of the file name or path.
 * @param {Severity[]} [severityFilter] Severities whose updates should remain.
 * @param {EventType[]} [typeFilter] Event categories that should remain.
 * @returns {Promise<void>}
 */
async function generateReport (v8log, head, format = 'html', fileNameFilter, severityFilter, typeFilter) {
  const parsedReport = await processLog(v8log, { root: process.cwd() })
  const report = filterReport(parsedReport, fileNameFilter, severityFilter, typeFilter)
  if (format === 'json' || format === 'compact_json' || format === 'jsonl') {
    let output
    if (format === 'compact_json') output = compactJson(report)
    else if (format === 'jsonl') output = toJsonl(report)
    else {
      const entries = []
      for (const entry of report) entries.push(entry)
      output = JSON.stringify(entries, null, 2)
    }
    const jsonFile = saveJson(output, format)
    const description = format === 'jsonl'
      ? 'deoptimization data as JSONL'
      : format === 'compact_json'
        ? 'compact deoptimization data'
        : 'deoptimization data'
    console.error(`
${head}: Successfully generated ${description}
  Saved to:
    ${jsonFile}
    `)
    return
  }

  const html = createPage(null)
  const indexHtmlFile = savePage(html)
  const entries = []
  for (const entry of report) entries.push(entry)
  const json = JSON.stringify(entries, null, 2)
  saveEntry(json)

  console.error(`
${head}: Successfully generated deoptimization visualization  🎉 ⚡ ✨
  Saved to:
    ${indexHtmlFile}
    `)
}

/**
 * Apply file and severity filters to a grouped report.
 * @param {Awaited<ReturnType<typeof processLog>>} report
 * @param {string | undefined} fileNameFilter
 * @param {Severity[] | undefined} severityFilter
 * @param {EventType[] | undefined} typeFilter
 * @returns {Awaited<ReturnType<typeof processLog>>}
 */
function filterReport (report, fileNameFilter, severityFilter, typeFilter) {
  if (fileNameFilter == null && severityFilter == null && typeFilter == null) return report

  const filteredReport = new Map()
  for (const [file, info] of report) {
    if (
      fileNameFilter != null &&
      !file.includes(fileNameFilter) &&
      !info.relativePath.includes(fileNameFilter)
    ) continue

    if (severityFilter == null && typeFilter == null) {
      filteredReport.set(file, info)
      continue
    }

    const filteredInfo = {
      ...info,
      ics: typeFilter != null && !typeFilter.includes('ic') ? [] : filterEventsBySeverity(info.ics, severityFilter),
      deopts: typeFilter != null && !typeFilter.includes('deopt') ? [] : filterEventsBySeverity(info.deopts, severityFilter),
      codes: typeFilter != null && !typeFilter.includes('opt') ? [] : filterEventsBySeverity(info.codes, severityFilter)
    }
    if (filteredInfo.ics.length === 0 && filteredInfo.deopts.length === 0 && filteredInfo.codes.length === 0) continue
    filteredReport.set(file, filteredInfo)
  }
  return filteredReport
}

/**
 * Keep each event with only updates in the selected severity set.
 * @param {import('../deoptigate.log').V8DataPoint[]} events
 * @param {Severity[] | undefined} severityFilter
 * @returns {import('../deoptigate.log').V8DataPoint[]}
 */
function filterEventsBySeverity (events, severityFilter) {
  /** @type {import('../deoptigate.log').V8DataPoint[]} */
  const filteredEvents = []
  for (const event of events) {
    /** @type {Record<string, unknown>[]} */
    const updates = []
    for (const update of event.updates) {
      if (severityFilter == null || severityFilter.includes(/** @type {Severity} */ (update.severity))) updates.push(update)
    }
    if (updates.length > 0) filteredEvents.push({ ...event, updates })
  }
  return filteredEvents
}

module.exports = generateReport
