'use strict'

const entities = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

const HTML_SPECIAL_CHARACTERS_RX = /[&<>"']/g

function escapeHtml(value) {
  return String(value).replace(HTML_SPECIAL_CHARACTERS_RX, character => entities[character])
}

module.exports = escapeHtml
