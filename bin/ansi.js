'use strict'

function color(code, text) {
  return `\u001b[${code}m${text}\u001b[39m`
}

module.exports = {
  blue: text => color(34, text),
  red: text => color(31, text),
  brightBlack: text => color(90, text)
}
