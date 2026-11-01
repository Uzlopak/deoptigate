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

// Tracks only dynamic code ranges, the only CodeMap feature used by deoptigate.
function CodeMap() {
  this.dynamics_ = new SplayTree()
}

CodeMap.prototype.addCode = function(start, entry) {
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

CodeMap.prototype.moveCode = function(from, to) {
  const removed = this.dynamics_.remove(from)
  this.addCode(to, removed.value)
}

CodeMap.prototype.deleteCode = function(start) {
  return this.dynamics_.remove(start)
}

CodeMap.prototype.findEntry = function(addr) {
  const node = this.dynamics_.findGreatestLessThan(addr)
  if (node && addr < node.key + node.value.size) return node.value
  return null
}

CodeMap.prototype.findDynamicEntryByStartAddress = function(addr) {
  const node = this.dynamics_.find(addr)
  return node ? node.value : null
}

CodeMap.CodeEntry = function(size, name, type) {
  this.size = size
  this.name = name || ''
  this.type = type || ''
  this.nameUpdated_ = false
}

module.exports = CodeMap
