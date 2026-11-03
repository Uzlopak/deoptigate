'use strict'

const reasons = require('../assets/deoptimization.json')

/** @typedef {{ type: string, message: string, meaning: string, examples: (string | null)[] }} DeoptimizationReasonData */

/**
 * @typedef {object} DeoptimizationReason
 * @property {string} code
 * @property {string} type
 * @property {string} message
 * @property {string} meaning
 * @property {(string | null)[]} examples
 */

/**
 * Look up a V8 deoptimization reason by its code.
 *
 * @param {unknown} reasonCode
 * @returns {DeoptimizationReason | null}
 */
function lookupDeoptimizationReason (reasonCode) {
  if (typeof reasonCode !== 'string') return null
  const reasonKey = reasonCode.trim()
  const reasonTable = /** @type {Record<string, DeoptimizationReasonData>} */ (reasons)
  const reason = reasonTable[reasonKey]
  if (!reason) return null
  return {
    code: reasonKey,
    type: reason.type,
    message: reason.message,
    meaning: reason.meaning,
    examples: reason.examples.slice()
  }
}

module.exports = lookupDeoptimizationReason
