'use strict'

/** @type {Record<string, string>} */
const entities = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

const HTML_SPECIAL_CHARACTERS_RX = /[&<>"']/g

/**
 * Escape HTML special characters in a value's string representation.
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value).replace(HTML_SPECIAL_CHARACTERS_RX, character => entities[character])
}

module.exports = escapeHtml
