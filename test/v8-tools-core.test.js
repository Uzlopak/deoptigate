'use strict'

const { test } = require('node:test')
const LogReader = require('../lib/v8-tools-core/logreader')
const CodeMap = require('../lib/v8-tools-core/codemap')
const SplayTree = require('../lib/v8-tools-core/splaytree')
const { Profile } = require('../lib/v8-tools-core/profile')
const { OPTIMIZATION_STATE_OPTIMIZED } = require('../lib/log-processing/optimization-state')

/** @typedef {{parsers: Array<((field: string) => unknown) | null>, processor: (...args: never[]) => void}} TestDispatch */
/**
 * @typedef {object} TestLogReader
 * @property {Map<string, TestDispatch | null>} dispatchTable_
 * @property {{parseLine(line: string): string[]}} csvParser_
 * @property {(chunk: string) => void} processLogChunk
 * @property {() => void} processLogEnd
 * @property {(line: string) => void} processLogLine
 */
/** @typedef {new () => TestLogReader} TestLogReaderConstructor */
/** @typedef {{key: number, value: unknown}} TestSplayNode */
/** @typedef {{insert(key: number, value: unknown): void, find(key: number): TestSplayNode | null, findGreatestLessThan(key: number): TestSplayNode | null, exportKeysAndValues(): Array<[number, unknown]>, remove(key: number): TestSplayNode}} TestSplayTree */
/** @typedef {new () => TestSplayTree} TestSplayTreeConstructor */
/** @typedef {{addCode(start: number, entry: {size: number, name: string, type: string}): void, moveCode(from: number, to: number): void, deleteCode(start: number): {key: number, value: unknown}, findDynamicEntryByStartAddress(addr: number): unknown, findEntry(addr: number): {size: number, name: string, type: string} | null}} TestCodeMap */
/** @typedef {new () => TestCodeMap} TestCodeMapConstructor */
/** @typedef {new (size: number, name?: string, type?: string) => {size: number, name: string, type: string}} TestCodeEntryConstructor */
/** @typedef {{getName(): string}} TestFunctionEntry */
/** @typedef {{func: TestFunctionEntry, state: number}} TestProfileEntry */
/** @typedef {{addFuncCode(type: string, name: string, timestamp: number, start: number, size: number, funcAddr: number, state: number): TestProfileEntry | null, findEntry(addr: number): TestProfileEntry | null, moveCode(from: number, to: number): void, moveFunc(from: number, to: number): void, deleteCode(start: number): void, codeMap_: {findDynamicEntryByStartAddress(addr: number): unknown | null}}} TestProfile */
/** @typedef {new () => TestProfile} TestProfileConstructor */

/** @type {TestLogReaderConstructor} */
const TestLogReaderBase = /** @type {TestLogReaderConstructor} */ (/** @type {unknown} */ (LogReader))
/** @type {TestSplayTreeConstructor} */
const TestSplayTreeClass = /** @type {TestSplayTreeConstructor} */ (/** @type {unknown} */ (SplayTree))
/** @type {TestCodeMapConstructor} */
const TestCodeMapClass = /** @type {TestCodeMapConstructor} */ (/** @type {unknown} */ (CodeMap))
/** @type {TestProfileConstructor} */
const TestProfileClass = /** @type {TestProfileConstructor} */ (/** @type {unknown} */ (Profile))
/** @type {TestCodeEntryConstructor} */
const TestCodeEntryClass = /** @type {TestCodeEntryConstructor} */ (/** @type {unknown} */ (CodeMap.CodeEntry))

/**
 * @param {TestSplayNode | null} node
 * @returns {TestSplayNode}
 */
function requireNode (node) {
  if (node == null) throw new Error('Expected a SplayTree node')
  return node
}

/**
 * @param {TestProfileEntry | null} entry
 * @returns {TestProfileEntry}
 */
function requireProfileEntry (entry) {
  if (entry == null) throw new Error('Expected a profile entry')
  return entry
}

test('LogReader dispatches parsed records and reports malformed rows without stopping', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  /** @type {[number, string][]} */
  const calls = []
  /** @type {string[]} */
  const errors = []
  class Reader extends TestLogReaderBase {
    constructor() {
      super()
      this.dispatchTable_ = new Map(Object.entries({
        record: {
          parsers: [ parseInt, null ]
        , processor: (/** @type {number} */ n, /** @type {string} */ value) => {
            if (value === 'throws') throw new Error('synthetic dispatch error')
            calls.push([ n, value ])
          }
        }
      }))
    }

    printError(/** @type {string} */ message) { errors.push(message) }
  }

  const reader = new Reader()
  let parsedRows = 0
  const parseLine = reader.csvParser_.parseLine
  reader.csvParser_.parseLine = function (line) {
    parsedRows++
    return parseLine.call(this, line)
  }
  reader.processLogChunk('record,12,hello\\nworld\nunknown,ignored\nrecord,13,throws\nrecord,14,still-runs')
  reader.processLogEnd()
  t.assert.deepEqual(calls, [ [ 12, 'hello\nworld' ], [ 14, 'still-runs' ] ], 'known records are parsed and processing continues after an error')
  t.assert.deepEqual(errors, [ 'line 3: synthetic dispatch error' ], 'reports errors with the source line number')
  t.assert.equal(parsedRows, 3, 'skips CSV parsing for unsupported record types')
})

test('LogReader joins records split across input chunks', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  /** @type {string[]} */
  const values = []
  class Reader extends TestLogReaderBase {
    constructor() {
      super()
      this.dispatchTable_ = new Map(Object.entries({
        record: {
          parsers: [ null ],
          processor: (/** @type {string} */ value) => values.push(value)
        }
      }))
    }
  }

  const reader = new Reader()
  reader.processLogChunk('record,par')
  t.assert.deepEqual(values, [], 'waits until a complete record is available')
  reader.processLogChunk('tial\n')
  t.assert.deepEqual(values, [ 'partial' ], 'dispatches the reconstructed record')
  reader.processLogEnd()
})

test('CodeMap resolves addresses on either side of the Smi range', (/** @type {import('node:test').TestContext} */ t) => {
  const map = new TestCodeMapClass()
  const low = new TestCodeEntryClass(16, 'low', 'JS')
  const high = new TestCodeEntryClass(16, 'high', 'JS')
  map.addCode(0, low)
  map.addCode(0x7f0000000000, high)
  t.assert.equal(map.findEntry(15), low)
  t.assert.equal(map.findEntry(16), null, 'the range end is exclusive')
  t.assert.equal(map.findEntry(0x7f000000000f), high)
  t.assert.equal(map.findDynamicEntryByStartAddress(0), low)
  map.moveCode(0, 0x7f0000000100)
  t.assert.equal(map.findEntry(0x7f0000000104), low, 'moves across the range')
  const removed = map.deleteCode(0x7f0000000100)
  t.assert.equal(removed.value, low, 'returns the removed entry')
  t.assert.equal(removed.key, 0x7f0000000100, 'at the address it was stored under')
  t.assert.equal(map.findEntry(0x7f0000000104), null)
})

test('LogReader ignores unknown commands that match Object prototype properties', (
  /** @type {import('node:test').TestContext} */ t
) => {
  /** @type {string[]} */
  const errors = []
  class Reader extends TestLogReaderBase {
    constructor() {
      super()
      this.dispatchTable_ = new Map()
    }

    printError(/** @type {string} */ message) {
      errors.push(message)
    }
  }

  const reader = new Reader()
  reader.processLogLine('toString,ignored')
  t.assert.deepEqual(errors, [], 'skips inherited names as unsupported commands')
})

test('CodeMap indexes, moves, deletes and replaces overlapping entries', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(5)
  const map = new TestCodeMapClass()
  const first = new TestCodeEntryClass(16, 'first', 'JS')
  const replacement = new TestCodeEntryClass(8, 'replacement', 'JS')
  map.addCode(100, first)
  t.assert.equal(map.findEntry(108), first, 'finds entries by an interior address')
  map.moveCode(100, 200)
  t.assert.equal(map.findEntry(108), null, 'old address is cleared when code moves')
  t.assert.equal(map.findEntry(208), first, 'moved entry is found at its new address')
  map.addCode(204, replacement)
  t.assert.equal(map.findEntry(208), replacement, 'new ranges replace overlapping entries')
  map.deleteCode(204)
  t.assert.equal(map.findEntry(208), null, 'deleted ranges are no longer found')
})

test('SplayTree maintains ordered address lookup and export', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(5)
  const tree = new TestSplayTreeClass()
  tree.insert(20, 'twenty')
  tree.insert(10, 'ten')
  tree.insert(30, 'thirty')
  t.assert.equal(requireNode(tree.find(10)).value, 'ten', 'finds an exact key')
  t.assert.equal(requireNode(tree.findGreatestLessThan(25)).key, 20, 'finds the closest lower key')
  t.assert.deepEqual(tree.exportKeysAndValues(), [ [ 30, 'thirty' ], [ 20, 'twenty' ], [ 10, 'ten' ] ], 'exports entries in tree traversal order')
  t.assert.equal(requireNode(tree.remove(20)).value, 'twenty', 'removes an entry')
  t.assert.equal(tree.find(20), null, 'removed entries are absent')
})

test('Profile associates optimized code with functions through moves and deletes', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(7)
  const profile = new TestProfileClass()
  const state = OPTIMIZATION_STATE_OPTIMIZED
  profile.addFuncCode('JS', 'run /tmp/example.js:2:1', 1, 100, 20, 50, state)

  let entry = requireProfileEntry(profile.findEntry(110))
  t.assert.equal(entry.func.getName(), 'run /tmp/example.js:2:1', 'maps code to its shared function name')
  t.assert.equal(entry.state, state, 'retains the optimization state')

  profile.moveCode(100, 200)
  t.assert.equal(requireProfileEntry(profile.findEntry(210)).func.getName(), 'run /tmp/example.js:2:1', 'moves code address ranges')
  profile.moveFunc(50, 60)
  entry = requireProfileEntry(profile.findEntry(210))
  t.assert.equal(entry.func.getName(), 'run /tmp/example.js:2:1', 'moves shared function addresses')
  t.assert.equal(profile.codeMap_.findDynamicEntryByStartAddress(50), null, 'removes the old shared function address')
  t.assert.ok(profile.codeMap_.findDynamicEntryByStartAddress(60), 'registers the shared function at its new address')
  profile.deleteCode(200)
  t.assert.equal(profile.findEntry(210), null, 'deletes code address ranges')
})

/** @typedef {{dispatchTable_: Map<string, unknown>, processLogLine(line: string): void, processStack(pc: number, func: number, stack: string[]): number[], printError(message: string): void, skipDispatch(dispatch: unknown): boolean}} TimedLogReader */

/**
 * Build a reader that records the first field of each dispatched row.
 *
 * @param {boolean} [timed]
 * @param {boolean} [pairwise]
 * @returns {{reader: TimedLogReader, seen: string[]}}
 */
function timedReader (timed, pairwise) {
  /** @type {string[]} */
  const seen = []
  const Reader = /** @type {new (table: object, timed?: boolean, pairwise?: boolean) => TimedLogReader} */ (/** @type {unknown} */ (LogReader))
  const dispatch = { parsers: [ null ], processor: (/** @type {string} */ value) => { seen.push(value) } }
  const table = new Map(Object.entries({ row: dispatch, tick: dispatch, 'current-time': dispatch, ignored: null }))
  const reader = new Reader(table, timed, pairwise)
  return { reader, seen }
}

test('LogReader holds timed lines until the next time marker', (/** @type {import('node:test').TestContext} */ t) => {
  const { reader, seen } = timedReader(true)
  reader.processLogLine('tick,dropped')
  reader.processLogLine('row,before')
  reader.processLogLine('current-time,1')
  reader.processLogLine('row,held')
  t.assert.deepEqual(seen, [ 'before' ], 'holds lines after the first marker')
  reader.processLogLine('current-time,2')
  t.assert.deepEqual(seen, [ 'before', 'held' ])
  reader.processLogLine('row,after')
  reader.processLogLine('current-time,3')
  t.assert.deepEqual(seen, [ 'before', 'held', 'after' ], 'each marker starts a new range')
})

test('LogReader ends a pairwise timed range at its second marker', (/** @type {import('node:test').TestContext} */ t) => {
  const { reader, seen } = timedReader(false, true)
  reader.processLogLine('current-time,1')
  reader.processLogLine('row,inside')
  reader.processLogLine('current-time,2')
  reader.processLogLine('tick,outside')
  reader.processLogLine('row,after')
  t.assert.deepEqual(seen, [ 'inside', 'after' ], 'ticks outside the range are dropped')
})

test('LogReader skips disabled and vetoed records', (/** @type {import('node:test').TestContext} */ t) => {
  const { reader, seen } = timedReader()
  reader.processLogLine('ignored,value')
  reader.processLogLine('ignored')
  reader.skipDispatch = () => true
  reader.processLogLine('row,value')
  t.assert.deepEqual(seen, [])
})

test('LogReader resolves stack frames relative to the previous frame', (/** @type {import('node:test').TestContext} */ t) => {
  const { reader } = timedReader()
  /** @type {string[]} */
  const errors = []
  t.assert.deepEqual(reader.processStack(0x10, 0, [ '+2', '-1', '20', 'overflow' ]), [ 0x10, 0x12, 0x11, 0x20 ], 'drops the overflow marker')
  t.assert.deepEqual(reader.processStack(0x10, 0x30, []), [ 0x10, 0x30 ], 'includes the function address')
  reader.printError = message => { errors.push(message) }
  reader.processStack(0, 0, [ 'overflow' ])
  t.assert.deepEqual(errors, [ 'dropping: overflow' ])
})

test('Profile ignores moves and deletes of untracked code', (/** @type {import('node:test').TestContext} */ t) => {
  const profile = new TestProfileClass()
  t.assert.doesNotThrow(() => profile.moveCode(0x1000, 0x2000))
  t.assert.doesNotThrow(() => profile.deleteCode(0x1000))
})

test('Profile names code and function entries', (/** @type {import('node:test').TestContext} */ t) => {
  const profile = /** @type {any} */ (new TestProfileClass())
  t.assert.equal(profile.addCode('Stub', 'load', 1, 0x100, 16).getName(), 'Stub: load')
  t.assert.equal(profile.addFuncCode('Function', 'run a.js:1:1', 1, 0x200, 16, 0x9000, 1).getName(), 'Function: ~run a.js:1:1')
  t.assert.equal(profile.addFuncCode('Function', '', 1, 0x300, 16, 0x9100, 0).getName(), 'Function: <anonymous>')
  t.assert.equal(profile.addFuncCode('Function', ' a.js:1:1', 1, 0x400, 16, 0x9200, 0).getName(), 'Function: <anonymous> a.js:1:1')
})

test('SplayTree handles empty trees, duplicates and missing keys', (/** @type {import('node:test').TestContext} */ t) => {
  const tree = /** @type {any} */ (new TestSplayTreeClass())
  t.assert.equal(tree.findMin(), null)
  t.assert.equal(tree.findMax(), null)
  t.assert.deepEqual(tree.exportValues(), [])
  t.assert.throws(() => tree.remove(1), /Key not found: 1/)
  t.assert.doesNotThrow(() => tree.splay_(1))

  tree.insert(2, 'two')
  tree.insert(2, 'duplicate')
  tree.insert(1, 'one')
  tree.insert(3, 'three')
  t.assert.equal(requireNode(tree.find(2)).value, 'two', 'keeps the first value for a key')
  t.assert.equal(tree.findMin().key, 1)
  t.assert.equal(tree.findMax().key, 3)
  t.assert.deepEqual(tree.exportValues().sort(), [ 'one', 'three', 'two' ])
  t.assert.throws(() => tree.remove(9), /Key not found: 9/)
})
