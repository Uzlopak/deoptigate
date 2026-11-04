'use strict'

const Preact = require('preact')
const { Component } = Preact
const scrollIntoView = /** @type {typeof import('scroll-into-view-if-needed').default} */ (
  /** @type {unknown} */ (require('scroll-into-view-if-needed'))
)

const assert = require('../../lib/assert')
const summaryEmptyMessage = require('../lib/summary-empty-state')
const summaryNavigationAttributes = require('../lib/summary-navigation')
const { nameIcState, severityIcState } = require('../../lib/log-processing/ic-state')
const {
  nameOptimizationState,
  severityOfOptimizationState
} = require('../../lib/log-processing/optimization-state')
const { MIN_SEVERITY } = require('../../lib/severities')

const severityClassNames = /** @type {const} */ ([
  'green i',
  'blue',
  'red b'
])

const OPT_TAB_IDX = 0
const DEOPT_TAB_IDX = 1
const ICS_TAB_IDX = 2

/** @typedef {import('../../lib/log-processing/ic-state').IcState} IcState */
/** @typedef {import('../../lib/log-processing/optimization-state').ParsedOptimizationState} ParsedOptimizationState */
/** @typedef {import('../../lib/severities').Severity} Severity */
/** @typedef {{timestamp: number, state: ParsedOptimizationState, severity: Severity}} CodeUpdate */
/** @typedef {{timestamp: number, bailoutType: string, deoptReason: string, inlined: boolean, severity: Severity}} DeoptUpdate */
/** @typedef {{oldState: IcState, newState: IcState, key: string, map: string, severity: Severity}} IcUpdate */
/** @typedef {{id: number, functionName: string, line: number, column: number, severity: Severity}} SummaryPoint */
/** @typedef {SummaryPoint & {updates: CodeUpdate[]}} CodeSummaryInfo */
/** @typedef {SummaryPoint & {updates: DeoptUpdate[]}} DeoptSummaryInfo */
/** @typedef {SummaryPoint & {updates: IcUpdate[]}} IcSummaryInfo */
/**
 * @template T
 * @typedef {Map<string, T> | null | undefined} SummaryData
 */
/**
 * @typedef {object} SummaryViewProps
 * @property {string=} className
 * @property {Map<string, IcSummaryInfo>|null} ics
 * @property {string[]} icLocations
 * @property {Map<string, DeoptSummaryInfo>|null} deopts
 * @property {string[]} deoptLocations
 * @property {Map<string, CodeSummaryInfo>|null} codes
 * @property {string[]} codeLocations
 * @property {number|null} selectedLocation
 * @property {boolean} includeAllSeverities
 * @property {string} relativePath
 * @property {number} selectedTabIdx
 * @property {(id: number) => void} onsummaryClicked
 * @property {(idx: number) => void} ontabHeaderClicked
 */
/** @typedef {import('preact').TargetedMouseEvent<HTMLAnchorElement>} SummaryClickEvent */

/** @extends {Component<SummaryViewProps>} */
class SummaryView extends Component {
  /** @param {SummaryViewProps} props */
  constructor (props) {
    super(props)
    const { ics, icLocations, deopts, deoptLocations, onsummaryClicked, ontabHeaderClicked } = props

    assert(ics == null || icLocations != null, 'need to provide locations for ics')
    assert(deopts == null || deoptLocations != null, 'need to provide locations for deopts')
    assert.equal(typeof onsummaryClicked, 'function', 'need to pass onsummaryClicked function')
    assert.equal(typeof ontabHeaderClicked, 'function', 'need to pass ontabHeaderClicked function')

    this._bind()
  }

  /** @returns {void} */
  _bind () {
    this._renderIc = this._renderIc.bind(this)
    this._renderDeopt = this._renderDeopt.bind(this)
    this._renderCode = this._renderCode.bind(this)
  }

  /** @returns {void} */
  _maybeScrollIntoView () {
    const { selectedLocation } = this.props
    if (selectedLocation == null) return
    const summary = document.getElementById(`summary-location-${selectedLocation}`)
    if (summary == null) return
    scrollIntoView(summary, { behavior: 'smooth', scrollMode: 'if-needed' })
  }

  /**
   * @override
   * @returns {void}
   */
  componentDidMount () {
    this._maybeScrollIntoView()
  }

  /**
   * @override
   * @returns {void}
   */
  componentDidUpdate () {
    this._maybeScrollIntoView()
  }

  /**
   * @override
   * @returns {import('preact').VNode}
   */
  render () {
    const {
      className = '',
      ics,
      icLocations,
      deopts,
      deoptLocations,
      codes,
      codeLocations,
      selectedTabIdx
    } = this.props
    const renderedDeopts = this._renderDeopts(deopts, deoptLocations, selectedTabIdx === DEOPT_TAB_IDX)
    const renderedIcs = this._renderIcs(ics, icLocations, selectedTabIdx === ICS_TAB_IDX)
    const renderedCodes = this._renderCodes(codes, codeLocations, selectedTabIdx === OPT_TAB_IDX)
    return (
      <div className={className}>
        <div className='flex flex-row summary-tabs' role='group' aria-label='Summary categories'>
          {this._renderTabHeader('Optimizations', OPT_TAB_IDX)}
          {this._renderTabHeader('Deoptimizations', DEOPT_TAB_IDX)}
          {this._renderTabHeader('Inline Caches', ICS_TAB_IDX)}
        </div>
        <div>
          {renderedCodes}
          {renderedDeopts}
          {renderedIcs}
        </div>
      </div>
    )
  }

  /*
   * Tabs
   */

  /**
   * @param {string} label
   * @param {number} idx
   * @returns {import('preact').VNode}
   */
  _renderTabHeader (label, idx) {
    const { selectedTabIdx } = this.props
    const selected = idx === selectedTabIdx
    const baseClass = 'flex flex-column ttu dib link outline-0 tab-header summary-tab'
    const selectedClass = 'tab-active'
    const unselectedClass = 'tab-inactive'
    const className = selected ? `${baseClass} ${selectedClass}` : `${baseClass} ${unselectedClass}`
    const tabAttributes = summaryNavigationAttributes(selected)

    return (
      <a
        className={className}
        href='#'
        {...tabAttributes}
        onClick={e => {
          e.preventDefault()
          this._ontabHeaderClicked(idx)
        }}
      >{label}
      </a>
    )
  }

  /**
   * @template {SummaryPoint & {updates: (CodeUpdate|DeoptUpdate|IcUpdate)[]}} T
   * @param {Map<string, T>} data
   * @param {string[]} locations
   * @param {(info: T) => import('preact').ComponentChild} renderDetails
   * @returns {import('preact').ComponentChild}
   */
  _renderDataPoint (data, locations, renderDetails) {
    const { selectedLocation, includeAllSeverities, relativePath } = this.props
    const rendered = []
    for (const loc of locations) {
      const info = data.get(loc)
      if (info == null) continue
      if (!includeAllSeverities && info.severity <= MIN_SEVERITY) continue

      const highlightedClass = selectedLocation === info.id ? 'bg-light-yellow' : 'bg-light-green'
      const className = `${highlightedClass} summary-card`
      rendered.push(
        <div className={className} key={info.id}>
          {this._summary(info, relativePath)}
          {renderDetails(info)}
        </div>
      )
    }
    const emptyMessage = summaryEmptyMessage(locations.length, rendered.length)
    if (emptyMessage != null) return <h4 className='ml4'>{emptyMessage}</h4>
    return rendered
  }

  /**
   * @param {SummaryData<IcSummaryInfo>} ics
   * @param {string[]} icLocations
   * @param {boolean} selected
   * @returns {import('preact').ComponentChild}
   */
  _renderIcs (ics, icLocations, selected) {
    if (ics == null) return null
    const className = selected ? '' : 'dn'
    const rendered = this._renderDataPoint(ics, icLocations, this._renderIc)
    return (
      <div key='ics' className={className}>
        {rendered}
      </div>
    )
  }

  /**
   * @param {SummaryData<DeoptSummaryInfo>} deopts
   * @param {string[]} deoptLocations
   * @param {boolean} selected
   * @returns {import('preact').ComponentChild}
   */
  _renderDeopts (deopts, deoptLocations, selected) {
    if (deopts == null) return null
    const className = selected ? '' : 'dn'
    const rendered = this._renderDataPoint(deopts, deoptLocations, this._renderDeopt)
    return (
      <div key='deopts' className={className}>
        {rendered}
      </div>
    )
  }

  /**
   * @param {SummaryData<CodeSummaryInfo>} codes
   * @param {string[]} codeLocations
   * @param {boolean} selected
   * @returns {import('preact').ComponentChild}
   */
  _renderCodes (codes, codeLocations, selected) {
    if (codes == null) return null
    const className = selected ? '' : 'dn'
    const rendered = this._renderDataPoint(codes, codeLocations, this._renderCode)
    return (
      <div key='optimizations' className={className}>
        {rendered}
      </div>
    )
  }

  /**
   * @param {SummaryPoint} info
   * @param {string} relativePath
   * @returns {import('preact').VNode}
   */
  _summary (info, relativePath) {
    const {
      id,
      functionName,
      line,
      column
    } = info
    const locationEl = <span className='dark-blue f5 mr2'>{id}</span>
    /** @param {SummaryClickEvent} e */
    const onclicked = e => {
      e.preventDefault()
      e.stopPropagation()
      this._onsummaryClicked(id)
    }

    const fullLoc = (
      <a
        href='#'
        className='summary-location-link'
        onClick={onclicked}
      >
        {functionName} at {relativePath}:{line}:{column}
      </a>
    )
    return (
      <div id={'summary-location-' + id}>
        {locationEl}
        {fullLoc}
      </div>
    )
  }

  /**
   * @param {DeoptSummaryInfo} info
   * @returns {import('preact').VNode}
   */
  _renderDeopt (info) {
    const rows = info.updates.map((update, idx) => this._deoptRow(update, idx))
    return (
      <table key={'deopt:' + info.id}>
        <thead className='f5 b pt2'>
          <tr>
            <td class='pt2 pr3 basegreen'>Timestamp</td>
            <td class='pt2 pr3 basegreen'>Bailout</td>
            <td class='pt2 pr3 basegreen'>Reason</td>
            <td class='pt2 pr3 basegreen'>Inlined</td>
          </tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
    )
  }

  /**
   * @param {DeoptUpdate} info
   * @param {number} idx
   * @returns {import('preact').VNode}
   */
  _deoptRow (info, idx) {
    const {
      inlined,
      bailoutType,
      deoptReason,
      timestamp,
      severity
    } = info
    const bailoutClassName = severityClassNames[severity - 1]
    const timeStampMs = (timestamp / 1E3).toFixed()
    return (
      <tr key={timestamp}>
        <td>{timeStampMs}ms</td>
        <td className={bailoutClassName + ' pr3'}>{bailoutType}</td>
        <td className='pr3'>{deoptReason}</td>
        <td className='gray pr3'>{inlined ? 'yes' : 'no'}</td>
      </tr>
    )
  }

  /**
   * @param {IcSummaryInfo} info
   * @returns {import('preact').VNode}
   */
  _renderIc (info) {
    const rows = info.updates.map((update, idx) => this._icRow(update, idx))
    return (
      <table key={'ic:' + info.id}>
        <thead className='f5 b '>
          <tr>
            <td class='pt2 pr3 basegreen'>Old State</td>
            <td class='pt2 pr3 basegreen'>New State</td>
            <td class='pt2 pr3 basegreen'>Key</td>
            <td class='pt2 pr3 basegreen'>Map</td>
          </tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
    )
  }

  /**
   * @param {IcUpdate} update
   * @param {number} id
   * @returns {import('preact').VNode}
   */
  _icRow (update, id) {
    const {
      oldState,
      newState,
      key,
      map
    } = update
    const oldStateName = nameIcState(oldState)
    const severityOldState = severityIcState(oldState)
    const oldStateClassName = severityClassNames[severityOldState - 1]

    const newStateName = nameIcState(newState)
    const severityNewState = severityIcState(newState)
    const newStateClassName = severityClassNames[severityNewState - 1]

    const mapString = `0x${map}`
    return (
      <tr key={key + id}>
        <td className={oldStateClassName + ' pr3'}>{oldStateName}</td>
        <td className={newStateClassName + ' pr3'}>{newStateName}</td>
        <td className='black pr3'>{key}</td>
        <td className='gray pr3'>{mapString}</td>
      </tr>
    )
  }

  /**
   * @param {CodeSummaryInfo} info
   * @returns {import('preact').VNode}
   */
  _renderCode (info) {
    const rows = info.updates.map((update, idx) => this._codeRow(update, idx))
    return (
      <table key={'code:' + info.id}>
        <thead className='f5 b '>
          <tr>
            <td class='pt2 pr3 basegreen'>Timestamp</td>
            <td class='pt2 pr3 basegreen'>Optimization State</td>
          </tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
    )
  }

  /**
   * @param {CodeUpdate} info
   * @param {number} id
   * @returns {import('preact').VNode}
   */
  _codeRow (info, id) {
    const { timestamp, state } = info
    const timeStampMs = (timestamp / 1E3).toFixed()
    const codeState = nameOptimizationState(state)
    const severity = severityOfOptimizationState(state)
    const codeStateClassName = severityClassNames[severity - 1]

    return (
      <tr key={timestamp}>
        <td>{timeStampMs}ms</td>
        <td className={codeStateClassName + ' pr3'}>{codeState}</td>
      </tr>
    )
  }

  /*
   * Events
   */
  /**
   * @param {number} idx
   * @returns {void}
   */
  _ontabHeaderClicked (idx) {
    const { ontabHeaderClicked } = this.props
    ontabHeaderClicked(idx)
  }

  /**
   * @param {number} id
   * @returns {void}
   */
  _onsummaryClicked (id) {
    const { onsummaryClicked } = this.props
    onsummaryClicked(id)
  }

  static get OPT_TAB_IDX () { return OPT_TAB_IDX }
  static get DEOPT_TAB_IDX () { return DEOPT_TAB_IDX }
  static get ICS_TAB_IDX () { return ICS_TAB_IDX }
}
module.exports = {
  SummaryView
}
