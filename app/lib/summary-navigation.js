'use strict'

/**
 * Mark the active summary category for assistive technology.
 * @param {boolean} selected Whether this category is active.
 * @returns {{'aria-current': 'true' | undefined}}
 */
function summaryNavigationAttributes (selected) {
  return { 'aria-current': selected ? 'true' : undefined }
}

module.exports = summaryNavigationAttributes
