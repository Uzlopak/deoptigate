'use strict'

/**
 * Wrap text in an ANSI foreground color sequence.
 * @param {number} code ANSI color code.
 * @param {string} text Text to colorize.
 * @returns {string}
 */
function color(code, text) {
  return `\u001b[${code}m${text}\u001b[39m`
}

/** @type {{ blue: (text: string) => string, red: (text: string) => string, brightBlack: (text: string) => string }} */
module.exports = {
  blue: text => color(34, text),
  red: text => color(31, text),
  brightBlack: text => color(90, text)
}
