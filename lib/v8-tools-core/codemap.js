// Copyright 2011 the V8 project authors. All rights reserved.
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

const SplayTree = require('./splaytree')

/** @typedef {{size: number, name: string, type: string, nameUpdated_: boolean, func: CodeEntry | null, state: number}} CodeEntry */
/** @typedef {{key: number, value: CodeEntry}} CodeNode */
/**
 * @typedef {object} DynamicCodeTree
 * @property {(key: number) => CodeNode | null} find
 * @property {(key: number) => CodeNode | null} findGreatestLessThan
 * @property {(key: number) => CodeNode} remove
 * @property {(key: number, value: CodeEntry) => void} insert
 */
/** @typedef {new () => DynamicCodeTree} DynamicCodeTreeConstructor */
/** @typedef {{dynamics_: DynamicCodeTree}} CodeMapInstance */

// Static builtins of older Node.js versions load at Smi-sized addresses, and
// everything after them doesn't. Tree keys are shifted out of the Smi range so
// V8 never speculates on Smi comparisons that the next address would break.
const TREE_KEY_OFFSET = 2 ** 32

// Tracks only dynamic code ranges, the only CodeMap feature used by deoptigate.
/** @constructor */
/** @this {CodeMapInstance} */
function CodeMap() {
  /** @type {DynamicCodeTree} */
  // The CommonJS import exposes the constructor as a callable function type;
  // this adapter supplies the exact operations CodeMap uses from its instance.
  this.dynamics_ = new (/** @type {DynamicCodeTreeConstructor} */ (/** @type {unknown} */ (SplayTree)))()
}

/**
 * Add a code entry, removing any existing entries whose address ranges overlap.
 * @param {number} address
 * @param {CodeEntry} entry
 * @returns {void}
 */
CodeMap.prototype.addCode = function(address, entry) {
  const start = address + TREE_KEY_OFFSET
  const end = start + entry.size
  let cursor = end - 1
  while (cursor >= start) {
    const node = this.dynamics_.findGreatestLessThan(cursor)
    if (!node) break
    const previousStart = node.key
    if (previousStart < end && start < previousStart + node.value.size) {
      this.dynamics_.remove(previousStart)
    }
    cursor = previousStart - 1
  }
  this.dynamics_.insert(start, entry)
}

/**
 * @param {number} from
 * @param {number} to
 * @returns {void}
 */
CodeMap.prototype.moveCode = function(from, to) {
  const removed = this.dynamics_.remove(from + TREE_KEY_OFFSET)
  this.addCode(to, removed.value)
}

/**
 * @param {number} start
 * @returns {CodeNode | null}
 */
CodeMap.prototype.deleteCode = function(start) {
  const removed = this.dynamics_.remove(start + TREE_KEY_OFFSET)
  return { key: start, value: removed.value }
}

/**
 * @param {number} addr
 * @returns {CodeEntry | null}
 */
CodeMap.prototype.findEntry = function(addr) {
  const key = addr + TREE_KEY_OFFSET
  const node = this.dynamics_.findGreatestLessThan(key)
  if (node && key < node.key + node.value.size) return node.value
  return null
}

/**
 * @param {number} addr
 * @returns {CodeEntry | null}
 */
CodeMap.prototype.findDynamicEntryByStartAddress = function(addr) {
  const node = this.dynamics_.find(addr + TREE_KEY_OFFSET)
  return node ? node.value : null
}

/**
 * Every kind of entry shares this one constructor: they sit in the same tree,
 * so separate shapes would make each read of `size` deoptimize on a new kind.
 * @param {number} size
 * @param {string} [name]
 * @param {string} [type]
 * @param {CodeEntry | null} [func] Shared function this code belongs to.
 * @param {number} [state] Optimization state of function code.
 * @constructor
 * @this {CodeEntry}
 */
CodeMap.CodeEntry = function(size, name, type, func, state) {
  this.size = size
  this.name = name || ''
  this.type = type || ''
  this.nameUpdated_ = false
  this.func = func || null
  this.state = state || 0
}

module.exports = CodeMap
