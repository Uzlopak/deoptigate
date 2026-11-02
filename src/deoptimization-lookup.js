'use strict'

const reasons = require('../assets/deoptimization.json')

function lookupDeoptimizationReason (reasonCode) {
  if (typeof reasonCode !== 'string') return null
  const reason = reasons[reasonCode.trim()]
  if (!reason) return null
  return {
    code: reasonCode.trim(),
    type: reason.type,
    message: reason.message,
    meaning: reason.meaning,
    examples: reason.examples.slice()
  }
}

module.exports = lookupDeoptimizationReason
