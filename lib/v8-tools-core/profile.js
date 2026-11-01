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

// This is the small subset of v8-tools-core's Profile API used by deoptigate:
// track code address ranges and resolve a program counter to its function.
function Profile() {
  this.codeMap_ = new CodeMap()
}

Profile.prototype.addCode = function(type, name, timestamp, start, size) {
  const entry = new Profile.DynamicCodeEntry(size, type, name)
  this.codeMap_.addCode(start, entry)
  return entry
}

Profile.prototype.addFuncCode = function(type, name, timestamp, start, size, funcAddr, state) {
  let func = this.codeMap_.findDynamicEntryByStartAddress(funcAddr)
  if (!func) {
    func = new Profile.FunctionEntry(name)
    this.codeMap_.addCode(funcAddr, func)
  } else if (func.name !== name) {
    func.name = name
  }

  let entry = this.codeMap_.findDynamicEntryByStartAddress(start)
  if (entry) {
    if (entry.size === size && entry.func === func) entry.state = state
  } else {
    entry = new Profile.DynamicFuncCodeEntry(size, type, func, state)
    this.codeMap_.addCode(start, entry)
  }
  return entry
}

Profile.prototype.moveCode = function(from, to) {
  try {
    this.codeMap_.moveCode(from, to)
  } catch (e) {
    // V8 logs can refer to code that was already removed from the profile.
  }
}

Profile.prototype.deleteCode = function(start) {
  try {
    this.codeMap_.deleteCode(start)
  } catch (e) {
    // Ignore deletion of code that was not tracked.
  }
}

Profile.prototype.moveFunc = function(from, to) {
  if (this.codeMap_.findDynamicEntryByStartAddress(from)) {
    this.codeMap_.moveCode(from, to)
  }
}

Profile.prototype.findEntry = function(addr) {
  return this.codeMap_.findEntry(addr)
}

Profile.DynamicCodeEntry = function(size, type, name) {
  CodeMap.CodeEntry.call(this, size, name, type)
}

Profile.DynamicCodeEntry.prototype.getName = function() {
  return this.type + ': ' + this.name
}

Profile.DynamicFuncCodeEntry = function(size, type, func, state) {
  CodeMap.CodeEntry.call(this, size, '', type)
  this.func = func
  this.state = state
}

Profile.DynamicFuncCodeEntry.STATE_PREFIX = [ '', '~', '*' ]
Profile.DynamicFuncCodeEntry.prototype.getName = function() {
  return this.type + ': ' + Profile.DynamicFuncCodeEntry.STATE_PREFIX[this.state] + this.func.getName()
}

Profile.FunctionEntry = function(name) {
  CodeMap.CodeEntry.call(this, 0, name)
}

Profile.FunctionEntry.prototype.getName = function() {
  if (this.name.length === 0) return '<anonymous>'
  return this.name.charAt(0) === ' ' ? '<anonymous>' + this.name : this.name
}

module.exports = { Profile }
