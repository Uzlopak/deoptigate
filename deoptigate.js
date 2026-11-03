'use strict'

/* eslint-disable camelcase */

const LogReader = require('./lib/v8-tools-core/logreader')
const { Profile } = require('./lib/v8-tools-core/profile')

const IcEntry = require('./lib/log-processing/ic-entry')
const DeoptEntry = require('./lib/log-processing/deopt-entry')
const CodeEntry = require('./lib/log-processing/code-entry')
const { parseOptimizationState } = require('./lib/log-processing/optimization-state')

const groupByFileAndLocation = require('./lib/grouping/group-by-file-and-location')

const FUNCTION_LOCATION_RX = /(.*):([0-9]+):([0-9]+)$/

/**
 * @param {string} s
 * @returns {number}
 */
function maybeNumber(s) {
  return parseInt(s)
}

/**
 * @param {{ func: { getName(): string } }} entry
 * @returns {{ fnFile: string, line: number, column: number }}
 */
function formatName(entry) {
  const name = entry.func.getName()
  const array = FUNCTION_LOCATION_RX.exec(name)
  if (!array) return { fnFile: name, line: -1, column: -1 }
  return {
      fnFile: array[1]
    , line: maybeNumber(array[2])
    , column: maybeNumber(array[3])
  }
}

/**
 * @param {string | null} file
 * @param {number} line
 * @param {number} column
 * @returns {string}
 */
function locationKey(file, line, column) {
  return `${file}:${line}:${column}`
}

// IC records gained a timestamp field after the PC in newer V8 releases.
// Parse them as raw fields and normalize both layouts in the processor.
const propertyICParser = /** @type {const} */ ([ 'var-args' ])

/**
 * @typedef {object} DeoptProcessorOptions
 * @property {boolean} [silentErrors]
 */

/** @typedef {import('./lib/log-processing/optimization-state').OptimizationState} OptimizationState */

/**
 * @typedef {object} FunctionInfo
 * @property {string} fnFile
 * @property {number} line
 * @property {number} column
 * @property {OptimizationState} state
 */

/** @typedef {import('./lib/log-processing/ic-entry').IcUpdate} IcUpdate */

/** @typedef {import('./lib/log-processing/deopt-entry').DeoptUpdate} DeoptUpdate */

/** @typedef {import('./lib/log-processing/code-entry').CodeUpdate} CodeUpdate */

/**
 * @typedef {object} IcRecord
 * @property {string} functionName
 * @property {string | null} file
 * @property {number} line
 * @property {number} column
 * @property {IcUpdate[]} updates
 */

/**
 * @typedef {object} DeoptRecord
 * @property {string} functionName
 * @property {string | null} file
 * @property {number} line
 * @property {number} column
 * @property {DeoptUpdate[]} updates
 */

/**
 * @typedef {object} CodeRecord
 * @property {string} functionName
 * @property {string | null} file
 * @property {number} line
 * @property {number} column
 * @property {boolean} isScript
 * @property {CodeUpdate[]} updates
 */

/**
 * @typedef {object} DeoptProcessorResult
 * @property {IcRecord[]} ics
 * @property {DeoptRecord[]} deopts
 * @property {CodeRecord[]} codes
 * @property {string} root
 */

/**
 * @typedef {object} LogReaderInstance
 * @property {ProcessLogLine} processLogLine
 * @property {Record<string, unknown>} dispatchTable_
 */

/**
 * @callback ProcessLogLine
 * @param {string} line
 * @returns {void}
 */

/**
 * @callback FindProfileEntry
 * @param {number} pc
 * @returns {{func: {getName(): string}, state: OptimizationState} | null}
 */

/**
 * @callback AddCode
 * @param {string} type
 * @param {string} name
 * @param {number} timestamp
 * @param {number} start
 * @param {number} size
 * @returns {unknown}
 */

/**
 * @callback AddFunctionCode
 * @param {string} type
 * @param {string} name
 * @param {number} timestamp
 * @param {number} start
 * @param {number} size
 * @param {number} functionAddress
 * @param {OptimizationState} state
 * @returns {unknown}
 */

/**
 * @callback MoveCode
 * @param {number} from
 * @param {number} to
 * @returns {void}
 */

/**
 * @callback DeleteCode
 * @param {number} start
 * @returns {void}
 */

/**
 * @callback MoveFunction
 * @param {number} from
 * @param {number} to
 * @returns {void}
 */

/**
 * @typedef {object} ProfileInstance
 * @property {FindProfileEntry} findEntry
 * @property {AddCode} addCode
 * @property {AddFunctionCode} addFuncCode
 * @property {MoveCode} moveCode
 * @property {DeleteCode} deleteCode
 * @property {MoveFunction} moveFunc
 */

/** @type {new () => LogReaderInstance} */
const LogReaderBase = /** @type {new () => LogReaderInstance} */ (/** @type {unknown} */ (LogReader))
/** @type {new () => ProfileInstance} */
const ProfileConstructor = /** @type {new () => ProfileInstance} */ (/** @type {unknown} */ (Profile))

class DeoptProcessor extends LogReaderBase {
  /**
   * @param {string} root
   * @param {DeoptProcessorOptions=} options
   */
  constructor(root, { silentErrors = true } = {}) {
    super()
    this._root = root
    this._silentErrors = silentErrors

    // passing dispatch table that references `this` before invoking super
    // doesn't work, so we set it afterwards
    this.dispatchTable_ = {

        // Collect info about CRUD of code
        'code-creation': {
            parsers: [
              null, parseInt, parseInt, parseInt, parseInt, null, 'var-args'
            ]
          , processor: this._processCodeCreation.bind(this)
        }
      , 'code-move': {
            parsers: [ parseInt, parseInt ]
          , processor: this._processCodeMove.bind(this)
        }
      , 'code-delete': {
            parsers: [ parseInt ]
          , processor: this._processCodeDelete.bind(this)
        }
      , 'sfi-move': {
            parsers: [ parseInt, parseInt ]
          , processor: this._processFunctionMove.bind(this)
        }

      // Collect deoptimization info
      , 'code-deopt': {
            parsers: [
              parseInt, parseInt, parseInt, parseInt, parseInt, null, null, null
            ]
          , processor: this._processCodeDeopt.bind(this)
        }

      // Collect IC info
      , 'LoadIC': {
            parsers : propertyICParser
          , processor: this._processPropertyIC.bind(this, 'LoadIC')
        }
      , 'StoreIC': {
            parsers : propertyICParser
          , processor: this._processPropertyIC.bind(this, 'StoreIC')
        }
      , 'KeyedLoadIC': {
            parsers : propertyICParser
          , processor: this._processPropertyIC.bind(this, 'KeyedLoadIC')
        }
      , 'KeyedStoreIC': {
            parsers : propertyICParser
          , processor: this._processPropertyIC.bind(this, 'KeyedStoreIC')
        }
      , 'StoreInArrayLiteralIC': {
            parsers : propertyICParser
          , processor: this._processPropertyIC.bind(this, 'StoreInArrayLiteralIC')
        }
    }

    this._profile = new ProfileConstructor()

    /** @type {Map<string, IcEntry>} */
    this.entriesIC = new Map()
    /** @type {Map<string, DeoptEntry>} */
    this.entriesDeopt = new Map()
    /** @type {Map<string, CodeEntry>} */
    this.entriesCode = new Map()
  }

  /**
   * @param {number} pc
   * @returns {FunctionInfo}
   */
  functionInfo(pc) {
    const entry = this._profile.findEntry(pc)
    if (entry == null) return { fnFile: '', line: -1, column: -1, state: -1 }
    const { fnFile, line, column } = formatName(entry)
    return { fnFile, line, column, state: entry.state }
  }

  /**
   * @param {string} type
   * @param {string[]} fields
   * @returns {void}
   */
  _processPropertyIC(
      type
    , fields
  ) {
    const modernFormat = fields.length >= 10
    const pc = parseInt(fields[0])
    const line = parseInt(fields[modernFormat ? 2 : 1])
    const column = parseInt(fields[modernFormat ? 3 : 2])
    const old_state = fields[modernFormat ? 4 : 3]
    const new_state = fields[modernFormat ? 5 : 4]
    const map = parseInt(fields[modernFormat ? 6 : 5])
    const propertyKey = fields[modernFormat ? 7 : 6]

    const { fnFile, state } = this.functionInfo(pc)
    const key = locationKey(fnFile, line, column)
    let icEntry = this.entriesIC.get(key)
    if (icEntry == null) {
      icEntry = new IcEntry(fnFile, line, column)
      this.entriesIC.set(key, icEntry)
    }
    icEntry.addUpdate(type, old_state, new_state, propertyKey, map, state)
  }

  // timestamp is in micro seconds
  // https://cs.chromium.org/chromium/src/v8/src/log.cc?l=892&rcl=8fecf0eff7357c1bee222f76c4e2f6fdd8759797
  /**
   * @param {number} timestamp
   * @param {number} size
   * @param {number} code
   * @param {number} inliningId
   * @param {number} scriptOffset
   * @param {string} bailoutType
   * @param {string} sourcePositionText
   * @param {string} deoptReasonText
   * @returns {void}
   */
  _processCodeDeopt(
      timestamp
    , size
    , code
    , inliningId
    , scriptOffset
    , bailoutType
    , sourcePositionText
    , deoptReasonText
  ) {
    const { fnFile, state } = this.functionInfo(code)
    const { file, line, column } = DeoptEntry.disassembleSourcePosition(sourcePositionText)

    const key = locationKey(file, line, column)
    let deoptEntry = this.entriesDeopt.get(key)
    if (deoptEntry == null) {
      // The parser's missing-position sentinel is null, and DeoptEntry keeps
      // that value at runtime even though its constructor docs currently say string.
      deoptEntry = new DeoptEntry(fnFile, /** @type {string} */ (file), line, column)
      this.entriesDeopt.set(key, deoptEntry)
    }
    deoptEntry.addUpdate(timestamp, bailoutType, deoptReasonText, state, inliningId)
  }

  /**
   * @param {string} type
   * @param {number} kind
   * @param {number} timestamp
   * @param {number} start
   * @param {number} size
   * @param {string} name
   * @param {string[]} maybe_func
   * @returns {void}
   */
  _processCodeCreation(
    type, kind, timestamp, start, size, name, maybe_func
  ) {
    if (maybe_func.length) {
      const funcAddr = parseInt(maybe_func[0])
      const state = parseOptimizationState(/** @type {import('./lib/log-processing/optimization-state').OptimizationStateMarker} */ (maybe_func[1]))
      this._profile.addFuncCode(
        type, name, timestamp, start, size, funcAddr, state
      )
      // V8 13 (Node 24) reports JavaScript functions as `JS`; older V8
      // versions use `LazyCompile`.
      const isScript = type === 'Script'
      const isUserFunction = type === 'LazyCompile' || type === 'JS'
      if (isUserFunction || isScript) {
        let { fnFile, line, column } = this.functionInfo(start)

        // only interested in Node.js anonymous wrapper function
        // (function (exports, require, module, __filename, __dirname) {
        const isNodeWrapperFunction = (line === 1 && column === 1)
        if (isScript && !isNodeWrapperFunction) return

        const key = locationKey(fnFile, line, column)
        let code = this.entriesCode.get(key)
        if (code == null) {
          code = new CodeEntry({ fnFile, line, column, isScript })
          this.entriesCode.set(key, code)
        }
        code.addUpdate(timestamp, state)
      }
    } else {
      this._profile.addCode(type, name, timestamp, start, size)
    }
  }

  /**
   * @param {number} from
   * @param {number} to
   * @returns {void}
   */
  _processCodeMove(from, to) {
    this._profile.moveCode(from, to)
  }

  /**
   * @param {number} start
   * @returns {void}
   */
  _processCodeDelete(start) {
    this._profile.deleteCode(start)
  }

  /**
   * @param {number} from
   * @param {number} to
   * @returns {void}
   */
  _processFunctionMove(from, to) {
    this._profile.moveFunc(from, to)
  }

  // @override
  /**
   * @param {string} msg
   * @returns {void}
   */
  printError(msg) {
    if (this._silentErrors) return
    console.trace()
    console.error(msg)
  }

  /**
   * @param {string} string
   * @returns {void}
   */
  processString(string) {
    var end = string.length
    var current = 0
    var next = 0
    var line
    while (current < end) {
      next = string.indexOf('\n', current)
      if (next === -1) break
      line = string.substring(current, next)
      current = next + 1
      this.processLogLine(line)
    }
  }

  /** @returns {void} */
  filterIcStateChanges() {
    const emptyEntries = new Set()
    for (const [ key, entry ] of this.entriesIC) {
      entry.filterIcStateChanges()
      if (entry.updates.length === 0) emptyEntries.add(key)
    }
    for (const key of emptyEntries) this.entriesIC.delete(key)
  }

  /** @returns {DeoptProcessorResult} */
  toObject() {
    const ics = []
    for (const entry of this.entriesIC.values()) {
      ics.push(entry.hashmap)
    }
    const deopts = []
    for (const entry of this.entriesDeopt.values()) {
      deopts.push(entry.hashmap)
    }
    const codes = []
    for (const entry of this.entriesCode.values()) {
      codes.push(entry.hashmap)
    }
    return { ics, deopts, codes, root: this._root }
  }

  /**
   * @param {number=} indent
   * @returns {string}
   */
  toJSON(indent = 2) {
    return JSON.stringify(this.toObject(), null, indent)
  }
}

/**
 * @param {AsyncIterable<string>} lines
 * @param {string} root
 * @returns {Promise<DeoptProcessor>}
 */
async function processLogContent(lines, root) {
  const deoptProcessor = new DeoptProcessor(root)
  for await (const line of lines) {
    deoptProcessor.processLogLine(line)
  }

  return deoptProcessor
}

/**
 * @typedef {{ functionName: string, line: number, column: number }} GroupedDataPoint
 * @typedef {{ ics: GroupedDataPoint[], deopts: GroupedDataPoint[], codes: GroupedDataPoint[] }} RawFileGroup
 * @typedef {{ ics: Map<string, GroupedDataPoint>, deopts: Map<string, GroupedDataPoint>, codes: Map<string, GroupedDataPoint>, icLocations: string[], deoptLocations: string[], codeLocations: string[] }} LocatedFileGroup
 */

/**
 * @param {Map<string, RawFileGroup>} groupedByFile
 * @returns {Map<string, LocatedFileGroup>}
 */
function deoptigate(groupedByFile) {
  const groupedByFileAndLocation = groupByFileAndLocation(groupedByFile)
  return groupedByFileAndLocation
}

module.exports = {
    processLogContent
  , deoptigate
}
