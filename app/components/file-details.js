'use strict'

const Preact = require('preact')
const { Component } = Preact

const { CodeView } = require('./code')
const { SummaryView } = require('./summary')

const assert = require('../../lib/assert')

/**
 * @typedef {import('../../lib/log-processing/ic-state').IcState} IcState
 * @typedef {import('../../lib/log-processing/optimization-state').OptimizationState} OptimizationState
 * @typedef {import('../../lib/log-processing/optimization-state').ParsedOptimizationState} ParsedOptimizationState
 * @typedef {import('../../lib/severities').Severity} Severity
 * @typedef {{type: string, oldState: IcState, newState: IcState, key: string, map: string, optimizationState: OptimizationState, severity: Severity}} InlineCacheUpdate
 * @typedef {{timestamp: number, bailoutType: string, deoptReason: string, optimizationState: OptimizationState, inlined: boolean, severity: Severity}} DeoptimizationUpdate
 * @typedef {{timestamp: number, state: ParsedOptimizationState, severity: Severity}} CodeUpdate
 * @typedef {{functionName: string, file: string | null, line: number, column: number, id: number, severity: Severity, updates: InlineCacheUpdate[]}} InlineCacheEntry
 * @typedef {{functionName: string, file: string | null, line: number, column: number, id: number, severity: Severity, updates: DeoptimizationUpdate[]}} DeoptimizationEntry
 * @typedef {{functionName: string, file: string | null, line: number, column: number, id: number, severity: Severity, isScript: boolean, updates: CodeUpdate[]}} CodeEntry
 * @typedef {{ics: Map<string, InlineCacheEntry>, icLocations: string[], deopts: Map<string, DeoptimizationEntry>, deoptLocations: string[], codes: Map<string, CodeEntry>, codeLocations: string[], src: string, relativePath: string}} FileDetailsData
 *
 * @typedef {object} FileDetailsViewProps
 * @property {Map<string, FileDetailsData>} groups
 * @property {string} selectedFile
 * @property {number | null} selectedLocation
 * @property {boolean} includeAllSeverities
 * @property {string=} className
 * @property {number} selectedSummaryTabIdx
 * @property {(id: number) => void} onsummaryClicked
 * @property {(id: number, type?: string) => void} onmarkerClicked
 * @property {(idx: number) => void} onsummaryTabIdxChanged
 */

/** @extends {Component<FileDetailsViewProps>} */
class FileDetailsView extends Component {
  /** @param {FileDetailsViewProps} props */
  constructor(props) {
    super(props)

    const { onsummaryTabIdxChanged } = props
    assert.equal(typeof onsummaryTabIdxChanged, 'function', 'need to pass onsummaryTabIdxChanged function')

    this._bind()
  }

  /** @returns {void} */
  _bind() {
    this._onmarkerClicked = this._onmarkerClicked.bind(this)
    this._onsummaryTabHeaderClicked = this._onsummaryTabHeaderClicked.bind(this)
  }

  /** @returns {import('preact').JSX.Element} */
  render() {
    const {
        groups
      , selectedFile
      , selectedLocation
      , includeAllSeverities
      , className = ''
      , selectedSummaryTabIdx
      , onsummaryClicked
    } = this.props

    const fileData = groups.get(selectedFile)
    assert(fileData != null, `missing grouped data for ${selectedFile}`)
    const {
        ics
      , icLocations
      , deopts
      , deoptLocations
      , codes
      , codeLocations
      , src
      , relativePath
    } = fileData

    return (
      <div className={className}>
        <CodeView
          className='flex-column code-view'
          selectedLocation={selectedLocation}
          fileName={selectedFile}
          code={src}
          ics={ics}
          icLocations={icLocations}
          deopts={deopts}
          deoptLocations={deoptLocations}
          codes={codes}
          codeLocations={codeLocations}
          includeAllSeverities={includeAllSeverities}
          onmarkerClicked={this._onmarkerClicked} />
        <SummaryView
          className='flex-column summary-view'
          relativePath={relativePath}
          selectedLocation={selectedLocation}
          ics={ics}
          icLocations={icLocations}
          deopts={deopts}
          deoptLocations={deoptLocations}
          codes={codes}
          codeLocations={codeLocations}
          includeAllSeverities={includeAllSeverities}
          selectedTabIdx={selectedSummaryTabIdx}
          ontabHeaderClicked={this._onsummaryTabHeaderClicked}
          onsummaryClicked={onsummaryClicked} />
      </div>
    )
  }

  /**
   * @param {number} id
   * @param {string | undefined} type
   * @returns {void}
   */
  _onmarkerClicked(id, type) {
    const {
        onmarkerClicked
      , onsummaryTabIdxChanged
      , selectedSummaryTabIdx
    } = this.props
    const markerSummaryTabIdx = (
        type === 'code' ? SummaryView.OPT_TAB_IDX
      : type === 'deopt' ? SummaryView.DEOPT_TAB_IDX
      : SummaryView.ICS_TAB_IDX
    )
    onmarkerClicked(id)
    if (markerSummaryTabIdx !== selectedSummaryTabIdx) {
      onsummaryTabIdxChanged(markerSummaryTabIdx)
    }
  }

  /**
   * @param {number} idx
   * @returns {void}
   */
  _onsummaryTabHeaderClicked(idx) {
    const { onsummaryTabIdxChanged } = this.props
    onsummaryTabIdxChanged(idx)
  }
}

module.exports = { FileDetailsView }
