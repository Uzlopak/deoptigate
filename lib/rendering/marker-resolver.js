'use strict'

const { severityColors, MIN_SEVERITY } = require('../severities')
const { unkeyLocation } = require('../grouping/location')
const assert = require('../assert')

const DEOPTSYMBOL = '▼'
const ICSYMBOL = '☎'
const CODESYMBOL = '▲'
const MARKER_LABELS = /** @type {const} */ ({
    deopt: 'Deoptimization'
  , ic: 'Inline cache'
  , code: 'Optimization'
})

/**
 * @typedef {{ line: number, column: number }} SourceLocation
 * @typedef {{ id: number, severity: import('../severities').Severity, isScript?: boolean | undefined, line: number, column: number }} MarkerInfo
 * @typedef {'deopt' | 'ic' | 'code'} MarkerKind
 * @typedef {{ before: string, after: string }} MarkerParts
 * @typedef {Map<string, MarkerInfo> | null | undefined} MarkerMap
 * @typedef {object} MarkerResolverOptions
 * @property {MarkerMap} [ics]
 * @property {MarkerMap} [deopts]
 * @property {MarkerMap} [codes]
 * @property {string[] | null} [icLocations]
 * @property {string[] | null} [deoptLocations]
 * @property {string[] | null} [codeLocations]
 * @property {number | null | undefined} [selectedLocation]
 * @property {boolean} [includeAllSeverities]
 */

/**
 * Determine whether the marker belongs at or before this code location.
 * @param {SourceLocation} codeLocation
 * @param {SourceLocation} markerLocation
 * @returns {boolean}
 */
function applyMark(codeLocation, markerLocation) {
  if (codeLocation.line > markerLocation.line) return true
  if (codeLocation.line < markerLocation.line) return false
  if (codeLocation.column < markerLocation.column) return false
  return true
}

/**
 * @param {MarkerMap} map
 * @returns {MarkerMap}
 */
function highSeverity(map) {
  if (map == null) return map
  const res = new Map()
  for (const [ key, info ] of map) {
    if (info.severity === MIN_SEVERITY) continue
    res.set(key, info)
  }
  return res
}

/**
 * @param {MarkerMap} map
 * @param {string[] | null | undefined} arr
 * @returns {string[]}
 */
function includedIn(map, arr) {
  if (map == null || arr == null) return []
  return arr.filter(x => map.has(x))
}

/** Resolve V8 optimization markers to positions in source code. */
class MarkerResolver {
  /**
   * @param {MarkerResolverOptions} options
   */
  constructor({
      ics
    , deopts
    , codes
    , icLocations
    , deoptLocations
    , codeLocations
    , selectedLocation = null
    , includeAllSeverities = true
  }) {
    assert(ics == null || icLocations != null, 'need to provide locations for ics')
    assert(deopts == null || deoptLocations != null, 'need to provide locations for deopts')
    assert(codes == null || codeLocations != null, 'need to provide locations for codes')

    this._ics = includeAllSeverities ? ics : highSeverity(ics)
    this._icLocations = includeAllSeverities ? (icLocations || []) : includedIn(this._ics, icLocations)
    this._icLocationIdx = 0

    this._deopts = includeAllSeverities ? deopts : highSeverity(deopts)
    this._deoptLocations = includeAllSeverities ? (deoptLocations || []) : includedIn(this._deopts, deoptLocations)
    this._deoptLocationIdx = 0

    this._codes = includeAllSeverities ? codes : highSeverity(codes)
    this._codeLocations = includeAllSeverities ? (codeLocations || []) : includedIn(this._codes, codeLocations)
    this._codeLocationIdx = 0

    this._selectedLocation = selectedLocation
  }

  /**
   * Resolve all marker strings for the supplied source location.
   * @param {SourceLocation} codeLocation
   * @returns {{ insertBefore: string, insertAfter: string }}
   */
  resolve(codeLocation) {
    let insertBefore = ''
    let insertAfter = ''
    {
      const { before, after } = this._resolveDeopt(codeLocation)
      insertBefore += before
      insertAfter += after
    }
    {
      const { before, after } = this._resolveIc(codeLocation)
      insertBefore += before
      insertAfter += after
    }
    {
      const { before, after } = this._resolveCode(codeLocation)
      insertBefore += before
      insertAfter += after
    }
    return { insertBefore, insertAfter }
  }

  /** @returns {SourceLocation | null} */
  nextLocation() {
    const nextIc = unkeyLocation(this._icLocations[this._icLocationIdx])
    const nextDeopt = unkeyLocation(this._deoptLocations[this._deoptLocationIdx])
    const nextOpt = unkeyLocation(this._codeLocations[this._codeLocationIdx])
    return [ nextDeopt, nextOpt ].reduce((next, loc) => {
      if (next == null) return loc
      if (loc == null) return next
      if (next.line > loc.line) return loc
      if (next.line < loc.line) return next
      return next.column < loc.column ? next : loc
    }, nextIc)
  }

  /**
   * @param {SourceLocation} codeLocation
   * @returns {MarkerParts}
   */
  _resolveDeopt(codeLocation) {
    if (this._deopts == null) return { before: '', after: '' }
    const { before, after, locationIdx } = this._resolve({
        codeLocation
      , map         : this._deopts
      , locationIdx : this._deoptLocationIdx
      , locations   : this._deoptLocations
    })
    this._deoptLocationIdx = locationIdx
    return { before, after }
  }

  /**
   * @param {SourceLocation} codeLocation
   * @returns {MarkerParts}
   */
  _resolveIc(codeLocation) {
    if (this._ics == null) return { before: '', after: '' }
    const { before, after, locationIdx } = this._resolve({
        codeLocation
      , map         : this._ics
      , locationIdx : this._icLocationIdx
      , locations   : this._icLocations
    })
    this._icLocationIdx = locationIdx
    return { before, after }
  }

  /**
   * @param {SourceLocation} loc
   * @returns {MarkerParts}
   */
  _resolveCode(loc) {
    if (this._codes == null) return { before: '', after: '' }
    const { before, after, locationIdx } = this._resolve({
        codeLocation: loc
      , map         : this._codes
      , locationIdx : this._codeLocationIdx
      , locations   : this._codeLocations
    })
    this._codeLocationIdx = locationIdx
    return { before, after }
  }

  /**
   * @param {{ map: Map<string, MarkerInfo>, codeLocation: SourceLocation, locationIdx: number, locations: string[] }} options
   * @returns {MarkerParts & { locationIdx: number }}
   */
  _resolve({ map, codeLocation, locationIdx, locations }) {
    let before = ''
    let after = ''

    let locationKey = locations[locationIdx]
    let currentLocation = unkeyLocation(locationKey)

    while (
      currentLocation != null &&
      applyMark(codeLocation, currentLocation)
    ) {
      const { result, placeBefore } = this._determineMarkerSymbol(map, locationKey)
      if (placeBefore) before += result
      else after += result
      locationIdx++
      locationKey = locations[locationIdx]
      currentLocation = unkeyLocation(locationKey)
    }
    return { before, after, locationIdx }
  }

  /**
   * @param {MarkerMap} map
   * @param {string} key
   * @returns {{ result: string, placeBefore: boolean }}
   */
  _determineMarkerSymbol(map, key) {
    const kind = (
        map === this._deopts ?  'deopt'
      : map === this._ics ? 'ic'
      : 'code'
    )
    const info = map?.get(key)
    if (info != null) {
      return this._handle(info, kind)
    }
    return { result: '', placeBefore: false }
  }

  /**
   * @param {MarkerInfo} info
   * @param {MarkerKind} kind
   * @returns {{ result: string, placeBefore: boolean }}
   */
  _handle(info, kind) {
    const result = this._determineBrowserMarkerSymbol(info, kind)

    // anonymous Node.js function wrapper
    const placeBefore = (info.isScript === true && info.line === 1 && info.column === 1)
    return { result, placeBefore }
  }

  /**
   * @param {MarkerInfo} info
   * @param {MarkerKind} kind
   * @returns {string}
   */
  _determineBrowserMarkerSymbol(info, kind) {
    const symbol = (
        kind === 'deopt' ? DEOPTSYMBOL
      : kind === 'ic' ? ICSYMBOL
      : CODESYMBOL
    )
    const color = severityColors[info.severity - 1]
    const className = (
      this._selectedLocation === info.id
      ? `${color} selected`
      : color
    )
    return (
      `<a href='#'id="code-location-${info.id}" class="${className}"` +
        ` data-markerid="${info.id}" data-markertype="${kind}"` +
        ` aria-label="${MARKER_LABELS[kind]} at line ${info.line}, column ${info.column}">` +
        `${symbol}</a>`
    )
  }
}

module.exports = MarkerResolver
