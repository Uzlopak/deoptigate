// Copyright 2009 the V8 project authors. All rights reserved.
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above
//       copyright notice, this list of conditions and the following
//       disclaimer in the documentation and/or other materials provided
//       with the distribution.
//     * Neither the name of Google Inc. nor the names of its
//       contributors may be used to endorse or promote products derived
//       from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

/**
 * Parse a fixed-length hexadecimal escape from a string.
 * @param {string} string
 * @param {number} start
 * @param {number} length
 * @returns {number} The parsed value, or -1 if the escape is invalid.
 */
function parseHexEscape(string, start, length) {
  if (string.length < start + length) return -1

  let value = 0
  for (let i = start; i < start + length; i++) {
    const code = string.charCodeAt(i)
    let digit
    if (code >= 48 && code <= 57) digit = code - 48
    else if (code >= 65 && code <= 70) digit = code - 55
    else if (code >= 97 && code <= 102) digit = code - 87
    else return -1
    value = value * 16 + digit
  }
  return value
}

/**
 * Creates a CSV lines parser.
 */
class CsvParser {
  /**
   * Decode V8's newline, hex, unicode and escaped-backslash sequences.
   * @param {string} string
   * @returns {string}
   */
  escapeField(string) {
    let slash = string.indexOf('\\')
    if (slash === -1) return string

    let result = string.slice(0, slash)
    let cursor = slash
    while (cursor < string.length) {
      slash = string.indexOf('\\', cursor)
      if (slash === -1) {
        result += string.slice(cursor)
        break
      }
      result += string.slice(cursor, slash)

      if (slash + 1 === string.length) {
        result += '\\'
        break
      }

      const escape = string[slash + 1]
      if (escape === '\\') {
        result += '\\'
        cursor = slash + 2
      } else if (escape === 'n') {
        result += '\n'
        cursor = slash + 2
      } else if (escape === 'x' || escape === 'u') {
        const digits = escape === 'x' ? 2 : 4
        const value = parseHexEscape(string, slash + 2, digits)
        if (value === -1) {
          result += '\\' + escape
          cursor = slash + 2
        } else {
          result += String.fromCharCode(value)
          cursor = slash + 2 + digits
        }
      } else {
        // Preserve unknown and malformed escapes as literal text.
        result += '\\' + escape
        cursor = slash + 2
      }
    }
    return result
  }

  /**
   * Parses a line of CSV-encoded values. Returns an array of fields.
   *
   * @param {string} line Input line.
   * @returns {string[]}
   */
  parseLine(line) {
    var pos = 0;
    var endPos = line.length;
    /** @type {string[]} */
    var fields = [];
    if (endPos == 0) return fields;
    let nextPos = 0;
    while(nextPos !== -1) {
      nextPos = line.indexOf(',', pos);
      let field;
      if (nextPos === -1) {
        field = line.substr(pos);
      } else {
        field = line.substring(pos, nextPos);
      }
      fields.push(this.escapeField(field));
      pos = nextPos + 1;
    };
    return fields
  }
}

if (typeof module === 'object' && typeof module.exports === 'object') {
  module.exports = CsvParser;
} 
