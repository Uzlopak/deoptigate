'use strict'

/**
 * Count the decimal digits used to render a line number, capped at ten.
 *
 * @param {number} n
 * @returns {1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}
 */
function getDigits (n) {
  if (n < 10) return 1
  if (n < 1E2) return 2
  if (n < 1E3) return 3
  if (n < 1E4) return 4
  if (n < 1E5) return 5
  if (n < 1E6) return 6
  if (n < 1E7) return 7
  if (n < 1E8) return 8
  if (n < 1E9) return 9
  return 10
}

/**
 * Left-pad a number with spaces to the requested digit width.
 *
 * @param {number} n
 * @param {number} totalDigits
 * @returns {string}
 */
function pad (n, totalDigits) {
  const padDigits = totalDigits - getDigits(n)
  switch (padDigits) {
    default:
    case 0: return '' + n
    case 1: return ' ' + n
    case 2: return '  ' + n
    case 3: return '   ' + n
    case 4: return '    ' + n
    case 5: return '     ' + n
    case 6: return '      ' + n
    case 7: return '       ' + n
    case 8: return '        ' + n
    case 9: return '         ' + n
    case 10: return '          ' + n
  }
}

module.exports = { getDigits, pad }
