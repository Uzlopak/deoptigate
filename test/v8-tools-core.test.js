'use strict'

const test = require('tape')
const LogReader = require('../lib/v8-tools-core/logreader')
const CodeMap = require('../lib/v8-tools-core/codemap')
const SplayTree = require('../lib/v8-tools-core/splaytree')
const { Profile } = require('../lib/v8-tools-core/profile')
const { OPTIMIZATION_STATE_OPTIMIZED } = require('../lib/log-processing/optimization-state')

test('LogReader dispatches parsed records and reports malformed rows without stopping', (t) => {
  const calls = []
  const errors = []
  class Reader extends LogReader {
    constructor() {
      super()
      this.dispatchTable_ = {
        record: {
          parsers: [ parseInt, null ]
        , processor: (n, value) => {
            if (value === 'throws') throw new Error('synthetic dispatch error')
            calls.push([ n, value ])
          }
        }
      }
    }

    printError(message) { errors.push(message) }
  }

  const reader = new Reader()
  let parsedRows = 0
  const parseLine = reader.csvParser_.parseLine
  reader.csvParser_.parseLine = function (line) {
    parsedRows++
    return parseLine.call(this, line)
  }
  reader.processLogChunk('record,12,hello\\nworld\nunknown,ignored\nrecord,13,throws\nrecord,14,still-runs')
  t.deepEqual(calls, [ [ 12, 'hello\nworld' ], [ 14, 'still-runs' ] ], 'known records are parsed and processing continues after an error')
  t.deepEqual(errors, [ 'line 3: synthetic dispatch error' ], 'reports errors with the source line number')
  t.equal(parsedRows, 3, 'skips CSV parsing for unsupported record types')
  t.end()
})

test('CodeMap indexes, moves, deletes and replaces overlapping entries', (t) => {
  const map = new CodeMap()
  const first = new CodeMap.CodeEntry(16, 'first', 'JS')
  const replacement = new CodeMap.CodeEntry(8, 'replacement', 'JS')
  map.addCode(100, first)
  t.equal(map.findEntry(108), first, 'finds entries by an interior address')
  map.moveCode(100, 200)
  t.equal(map.findEntry(108), null, 'old address is cleared when code moves')
  t.equal(map.findEntry(208), first, 'moved entry is found at its new address')
  map.addCode(204, replacement)
  t.equal(map.findEntry(208), replacement, 'new ranges replace overlapping entries')
  map.deleteCode(204)
  t.equal(map.findEntry(208), null, 'deleted ranges are no longer found')
  t.end()
})

test('SplayTree maintains ordered address lookup and export', (t) => {
  const tree = new SplayTree()
  tree.insert(20, 'twenty')
  tree.insert(10, 'ten')
  tree.insert(30, 'thirty')
  t.equal(tree.find(10).value, 'ten', 'finds an exact key')
  t.equal(tree.findGreatestLessThan(25).key, 20, 'finds the closest lower key')
  t.deepEqual(tree.exportKeysAndValues(), [ [ 30, 'thirty' ], [ 20, 'twenty' ], [ 10, 'ten' ] ], 'exports entries in tree traversal order')
  t.equal(tree.remove(20).value, 'twenty', 'removes an entry')
  t.equal(tree.find(20), null, 'removed entries are absent')
  t.end()
})

test('Profile associates optimized code with functions through moves and deletes', (t) => {
  const profile = new Profile()
  const state = OPTIMIZATION_STATE_OPTIMIZED
  profile.addFuncCode('JS', 'run /tmp/example.js:2:1', 1, 100, 20, 50, state)

  let entry = profile.findEntry(110)
  t.equal(entry.func.getName(), 'run /tmp/example.js:2:1', 'maps code to its shared function name')
  t.equal(entry.state, state, 'retains the optimization state')

  profile.moveCode(100, 200)
  t.equal(profile.findEntry(210).func.getName(), 'run /tmp/example.js:2:1', 'moves code address ranges')
  profile.moveFunc(50, 60)
  entry = profile.findEntry(210)
  t.equal(entry.func.getName(), 'run /tmp/example.js:2:1', 'moves shared function addresses')
  t.equal(profile.codeMap_.findDynamicEntryByStartAddress(50), null, 'removes the old shared function address')
  t.ok(profile.codeMap_.findDynamicEntryByStartAddress(60), 'registers the shared function at its new address')
  profile.deleteCode(200)
  t.equal(profile.findEntry(210), null, 'deletes code address ranges')
  t.end()
})
