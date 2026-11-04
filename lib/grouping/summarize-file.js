'use strict'

const { highestSeverity, lowestSeverity } = require('../severities')
const SEVERITY_2_FACTOR = 10
const SEVERITY_3_FACTOR = 30

/** @typedef {import('../log-processing/optimization-state').ParsedOptimizationState} ParsedOptimizationState */
/** @typedef {import('../severities').Severity} Severity */
/** @typedef {{severity: Severity, state?: ParsedOptimizationState}} SummaryUpdate */
/** @typedef {SummaryUpdate & {state: ParsedOptimizationState}} CodeSummaryUpdate */
/** @typedef {{updates: SummaryUpdate[], severity?: number}} SummaryVector */
/** @typedef {{updates: CodeSummaryUpdate[], severity?: number}} CodeSummaryVector */
/**
 * @typedef {Object} FileSummaryInput
 * @property {Map<string, SummaryVector>} ics
 * @property {Map<string, SummaryVector>} deopts
 * @property {Map<string, CodeSummaryVector>} codes
 */

/**
 * Count the state of the final code update.
 * @param {number[]} codeStates
 * @param {CodeSummaryUpdate[]} updates
 * @returns {void}
 */
function addLastCodeState(codeStates, updates) {
  const lastState = updates[updates.length - 1].state
  codeStates[lastState]++
}

/**
 * Calculate severity totals and the final code-state totals for a file.
 * @param {FileSummaryInput} input
 * @returns {{icSeverities: number[], deoptSeverities: number[], deoptCount: number, codeSeverities: number[], codeStates: number[], severityScore: number, hasCriticalSeverities: boolean}}
 */
function summarizeFile({ ics, deopts, codes }) {
  const icSeverities = [ 0, 0, 0, 0 ]
  const deoptSeverities = [ 0, 0, 0, 0 ]
  let deoptCount = 0
  const codeSeverities = [ 0, 0, 0, 0 ]
  const codeStates = [ 0, 0, 0 ]
  for (const icVector of ics.values()) {
    const hs = highestSeverity(icVector.updates)
    icVector.severity = hs
    icSeverities[hs]++
  }
  for (const deoptVector of deopts.values()) {
    const hs = highestSeverity(deoptVector.updates)
    deoptVector.severity = hs
    deoptSeverities[hs]++
    deoptCount += deoptVector.updates.length
  }
  for (const codeVector of codes.values()) {
    const { updates } = codeVector
    let hs = lowestSeverity(updates)
    // if there are lots of updates that means the function was optimized a lot
    // which could point to an issue
    if (updates.length > 3) hs = Math.max(hs, 3)
    codeSeverities[hs]++
    codeVector.severity = hs
    addLastCodeState(codeStates, updates)
  }

  const severityScore = (
      icSeverities[1]
    + icSeverities[2] * SEVERITY_2_FACTOR
    + icSeverities[3] * SEVERITY_3_FACTOR
    + deoptSeverities[1]
    + deoptSeverities[2] * SEVERITY_2_FACTOR
    + deoptSeverities[3] * SEVERITY_3_FACTOR
    + codeSeverities[1]
    + codeSeverities[2] * SEVERITY_2_FACTOR
    + codeSeverities[3] * SEVERITY_3_FACTOR
  )
  const hasCriticalSeverities = (
       icSeverities[2] > 0
    || icSeverities[3] > 0
    || deoptSeverities[2] > 0
    || deoptSeverities[3] > 0
    || codeSeverities[2] > 0
    || codeSeverities[3] > 0
  )
  return {
      icSeverities
    , deoptSeverities
    , deoptCount
    , codeSeverities
    , codeStates
    , severityScore
    , hasCriticalSeverities
  }
}

module.exports = summarizeFile
