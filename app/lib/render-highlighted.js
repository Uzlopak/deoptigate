'use strict'

const escapeHtml = require('../../lib/rendering/escape-html')
const { getDigits, pad } = require('../../lib/rendering/line-number')

// Private use characters, so a placeholder keeps its form through escapeHtml
const PLACEHOLDER_START = ''
const PLACEHOLDER_END = ''
const PLACEHOLDER_RX = new RegExp(`${PLACEHOLDER_START}(\\d+)${PLACEHOLDER_END}`, 'g')

/**
 * Stand in for a rendered fragment until the highlighted code has been escaped.
 *
 * @param {number} index Position of the fragment in the list of fragments.
 * @returns {string}
 */
function placeholder(index) {
  return PLACEHOLDER_START + index + PLACEHOLDER_END
}

/**
 * @param {number} lineCount
 * @returns {string}
 */
function lineNumbers(lineCount) {
  const totalDigits = getDigits(lineCount)
  const lines = []
  for (let lineno = 1; lineno <= lineCount; lineno++) {
    lines.push(`<span class="lineno">${pad(lineno, totalDigits)}</span>`)
  }
  return lines.join('\n')
}

/**
 * Build the page markup for code whose tokens were replaced by placeholders.
 *
 * The syntax highlighter copies whatever no renderer handled into its result
 * as is, such as a hashbang line or a token type the theme lacks. Everything is
 * therefore escaped here, and only fragments rendered by the theme become markup.
 *
 * @param {string} transformedCode Highlighter output containing placeholders.
 * @param {string[]} fragments HTML rendered by the theme.
 * @returns {string} HTML fragment.
 */
function renderHighlighted(transformedCode, fragments) {
  const code = escapeHtml(transformedCode).replace(PLACEHOLDER_RX, (match, index) => {
    const fragment = fragments[Number(index)]
    return fragment === undefined ? match : fragment
  })

  return [
    '<div class="highlight"><pre>',
    '<table>',
    '<td>',
    lineNumbers(code.split('\n').length),
    '</td>',
    '<td>',
    code,
    '</td>',
    '</table>',
    '</pre></div>'
  ].join('\n')
}

module.exports = { placeholder, renderHighlighted }
