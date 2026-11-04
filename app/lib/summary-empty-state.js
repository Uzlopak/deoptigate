'use strict'

/**
 * Choose the message shown when a summary category has no visible records.
 *
 * @param {number} locationCount
 * @param {number} visibleCount
 * @returns {string | null}
 */
function summaryEmptyMessage (locationCount, visibleCount) {
  if (locationCount === 0) return 'None'
  if (visibleCount === 0) return 'No events match the current severity filter.'
  return null
}

module.exports = summaryEmptyMessage
