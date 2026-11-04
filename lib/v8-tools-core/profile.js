// Copyright 2009 the V8 project authors. All rights reserved.
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//     * Neither the name of Google Inc. nor the names of its contributors may
//       be used to endorse or promote products derived from this software
//       without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
// TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
// PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
// CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
// EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
// PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
// OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
// WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
// OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
// ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

'use strict'

const CodeMap = require('./codemap')

/** @typedef {{ size: number, name: string, type: string, nameUpdated_: boolean, func: FunctionEntry | null, state: number }} CodeMapEntry */
/** @typedef {CodeMapEntry & { getName(): string }} ProfileEntry */
/** @typedef {ProfileEntry & { func: FunctionEntry, state: number }} DynamicFuncEntry */
/** @typedef {ProfileEntry} DynamicCodeEntry */
/** @typedef {ProfileEntry} FunctionEntry */
/** @typedef {{ addCode(start: number, entry: CodeMapEntry): void, findDynamicEntryByStartAddress(addr: number): (DynamicCodeEntry | FunctionEntry | null), moveCode(from: number, to: number): void, deleteCode(start: number): unknown, findEntry(addr: number): ProfileEntry | null }} CodeMapInstance */
/** @typedef {{ codeMap_: CodeMapInstance }} ProfileInstance */

/** @typedef {new (size: number, name: string, type?: string, func?: FunctionEntry, state?: number) => ProfileEntry} ProfileEntryConstructor */

const ProfileEntryCtor = /** @type {ProfileEntryConstructor} */ (/** @type {unknown} */ (CodeMap.CodeEntry))
const CodeMapCtor = /** @type {new () => CodeMapInstance} */ (/** @type {unknown} */ (CodeMap))

// This is the small subset of v8-tools-core's Profile API used by deoptigate:
// track code address ranges and resolve a program counter to its function.
/** @constructor @this {ProfileInstance} */
function Profile() {
  this.codeMap_ = new CodeMapCtor()
}

/**
 * @this {ProfileInstance}
 * @param {string} type
 * @param {string} name
 * @param {number} timestamp
 * @param {number} start
 * @param {number} size
 * @returns {DynamicCodeEntry}
 */
Profile.prototype.addCode = function(type, name, timestamp, start, size) {
  const entry = new ProfileEntryCtor(size, name, type)
  this.codeMap_.addCode(start, entry)
  return entry
}

/**
 * @this {ProfileInstance}
 * @param {string} type
 * @param {string} name
 * @param {number} timestamp
 * @param {number} start
 * @param {number} size
 * @param {number} funcAddr
 * @param {number} state
 * @returns {DynamicFuncEntry | null}
 */
Profile.prototype.addFuncCode = function(type, name, timestamp, start, size, funcAddr, state) {
  /** @type {FunctionEntry | null} */
  let func = /** @type {FunctionEntry | null} */ (this.codeMap_.findDynamicEntryByStartAddress(funcAddr))
  if (!func) {
    func = new ProfileEntryCtor(0, name)
    this.codeMap_.addCode(funcAddr, func)
  } else if (func.name !== name) {
    func.name = name
  }

  /** @type {DynamicFuncEntry | null} */
  let entry = /** @type {DynamicFuncEntry | null} */ (this.codeMap_.findDynamicEntryByStartAddress(start))
  if (entry) {
    if (entry.size === size && entry.func === func) {
      entry.state = state
      return entry
    }
    // The address was reused by different code.
    this.codeMap_.deleteCode(start)
  }
  entry = /** @type {DynamicFuncEntry} */ (new ProfileEntryCtor(size, '', type, func, state))
  this.codeMap_.addCode(start, entry)
  return entry
}

/**
 * @this {ProfileInstance}
 * @param {number} from
 * @param {number} to
 * @returns {void}
 */
Profile.prototype.moveCode = function(from, to) {
  try {
    this.codeMap_.moveCode(from, to)
  } catch (e) {
    // V8 logs can refer to code that was already removed from the profile.
  }
}

/**
 * @this {ProfileInstance}
 * @param {number} start
 * @returns {void}
 */
Profile.prototype.deleteCode = function(start) {
  try {
    this.codeMap_.deleteCode(start)
  } catch (e) {
    // Ignore deletion of code that was not tracked.
  }
}

/**
 * @this {ProfileInstance}
 * @param {number} from
 * @param {number} to
 * @returns {void}
 */
Profile.prototype.moveFunc = function(from, to) {
  if (this.codeMap_.findDynamicEntryByStartAddress(from)) {
    this.codeMap_.moveCode(from, to)
  }
}

/**
 * @this {ProfileInstance}
 * @param {number} addr
 * @returns {ProfileEntry | null}
 */
Profile.prototype.findEntry = function(addr) {
  return this.codeMap_.findEntry(addr)
}

/** @type {string[]} */
const STATE_PREFIX = /** @type {const} */ ([ '', '~', '*' ])

/**
 * @this {ProfileEntry}
 * @returns {string}
 */
CodeMap.CodeEntry.prototype.getName = function() {
  if (this.func) return this.type + ': ' + STATE_PREFIX[this.state] + this.func.getName()
  if (this.type) return this.type + ': ' + this.name
  if (this.name.length === 0) return '<anonymous>'
  return this.name.charAt(0) === ' ' ? '<anonymous>' + this.name : this.name
}

module.exports = { Profile }
