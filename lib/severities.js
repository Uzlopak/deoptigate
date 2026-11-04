'use strict'

/** Color associated with each severity, starting at MIN_SEVERITY. */
const severityColors = /** @type {const} */ ([
  'green',
  'blue',
  'dark-red'
])
const SEVERITY_LEVELS = /** @type {const} */ ([1, 2, 3])

/** @typedef {typeof SEVERITY_LEVELS[number]} Severity */

const MIN_SEVERITY = SEVERITY_LEVELS[0]

/** @typedef {{ severity: Severity }} SeverityInfo */

/**
 * Return the greatest severity in a list of infos.
 * Empty lists use the minimum severity as their default.
 *
 * @param {SeverityInfo[]} infos
 * @returns {Severity}
 */
function highestSeverity (infos) {
  /** @type {Severity} */
  let highest = MIN_SEVERITY
  for (const { severity } of infos) {
    if (severity > highest) highest = severity
  }
  return highest
}

/**
 * Return the least severity in a list of infos.
 * Empty lists use 99 as their sentinel value.
 *
 * @param {SeverityInfo[]} infos
 * @returns {number}
 */
function lowestSeverity (infos) {
  return infos.reduce(
    (lowest, { severity }) => severity < lowest ? severity : lowest,
    99
  )
}

module.exports = {
  severityColors,
  SEVERITY_LEVELS,
  MIN_SEVERITY,
  highestSeverity,
  lowestSeverity
}
