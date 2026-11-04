'use strict'

const Preact = require('preact')
const { Component } = Preact
const summarizeFile = require('../../lib/grouping/summarize-file')
const assert = require('../../lib/assert')

const severityClassNames = /** @type {const} */ ([
    'green i tc'
  , 'blue tc'
  , 'red b tc'
])

const underlineTdClass = ' pl2 pr2 underlined '

/**
 * @typedef {import('../../lib/log-processing/optimization-state').ParsedOptimizationState} ParsedOptimizationState
 * @typedef {import('../../lib/severities').Severity} Severity
 * @typedef {{severity: Severity, state?: ParsedOptimizationState}} FileUpdate
 * @typedef {{severity: Severity, state: ParsedOptimizationState}} FileCodeUpdate
 * @typedef {{functionName: string, line: number, column: number, id?: number, updates: FileUpdate[], severity?: Severity}} FileDataPoint
 * @typedef {{functionName: string, line: number, column: number, id?: number, updates: FileCodeUpdate[], severity?: Severity}} CodeFileDataPoint
 * @typedef {Object} FileGroup
 * @property {Map<string, FileDataPoint>} ics
 * @property {Map<string, FileDataPoint>} deopts
 * @property {Map<string, CodeFileDataPoint>} codes
 * @property {string} relativePath
 */

/**
 * @typedef {Object} FilesViewProps
 * @property {Map<string, FileGroup>} groups
 * @property {boolean} includeAllSeverities
 * @property {string=} className
 * @property {string|null} selectedFile
 * @property {(file: string) => void} onfileClicked
 */

/**
 * Render severity counts as table cells.
 * @param {number[]} arr
 * @returns {import('preact').ComponentChildren[]}
 */
function coloredTds(arr) {
  return arr.map((x, idx) => {
    const className = x > 0
      ? severityClassNames[idx] + ' tr' + underlineTdClass
      : ' pl2 pr2 tc i gray' + underlineTdClass
    return <td key={idx} className={className}>{x}</td>
  })
}

/**
 * Sort file summaries from highest to lowest severity score.
 * @param {{file: string, summary: {severityScore: number}}} a
 * @param {{file: string, summary: {severityScore: number}}} b
 * @returns {number}
 */
function bySeverityScoreDesc({ summary: s1 }, { summary: s2 }) {
  return s1.severityScore < s2.severityScore ? 1 : -1
}

/** @extends {Component<FilesViewProps>} */
class FilesView extends Component {
  /** @param {FilesViewProps} props */
  constructor(props) {
    super(props)
    const { onfileClicked } = props
    assert.equal(typeof onfileClicked, 'function', 'need to pass onfileClicked function')
  }

  /** @returns {import('preact').JSX.Element} */
  render() {
    const { groups, includeAllSeverities, className = '' } = this.props
    const tableHeader = this._renderTableHeader()
    const rows = []
    const filesSeverities = Array.from(groups)
      .map(([ file, info ]) => {
        const { deopts, ics, codes } = info
        const summary = summarizeFile({ ics, deopts, codes })
        return { file, summary }
      })
      .filter(({ summary }) => includeAllSeverities || summary.hasCriticalSeverities)
      .sort(bySeverityScoreDesc)

    for (const { file, summary } of filesSeverities) {
      const { icSeverities, deoptSeverities, deoptCount, codeStates } = summary
      const fileGroup = groups.get(file)
      if (fileGroup == null) continue
      const { relativePath } = fileGroup
      const rendered = this._renderFile({
          file
        , relativePath
        , icSeverities
        , deoptSeverities
        , deoptCount
        , codeStates
      })
      rows.push(rendered)
    }

    if (rows.length === 0) {
      const message = includeAllSeverities
        ? 'No files were found in this V8 log.'
        : 'No files with critical events. Enable “Include low severities” to show all files.'
      rows.push(
        <tr key='empty-state'>
          <td className='empty-table-state' colSpan={11}>{message}</td>
        </tr>
      )
    }

    return (
      <div className={className}>
        <table className='files-table' cellSpacing='0'>
          <colgroup>
            <col className='file-column' />
            <col span={10} className='metric-column' />
          </colgroup>
          {tableHeader}
          <tbody>{rows}</tbody>
        </table>
      </div>
    )
  }

  /** @returns {import('preact').JSX.Element} */
  _renderTableHeader() {
    const topHeaderClass = 'tc header-row pt2 pb1 '
    const subHeaderClass = 'pa1 pl2 pr2 subhead'
    return (
      <thead>
        <tr>
          <th scope='col' rowSpan={2} className={topHeaderClass + ' file-header'}>File</th>
          <th scope='colgroup' colSpan={3} className={topHeaderClass}>Optimizations</th>
          <th scope='colgroup' colSpan={4} className={topHeaderClass}>Deoptimizations</th>
          <th scope='colgroup' colSpan={3} className={topHeaderClass}>Inline Caches</th>
        </tr>
        <tr>
          <th scope='col' className={subHeaderClass}>Optimized</th>
          <th scope='col' className={subHeaderClass}>Optimizable</th>
          <th scope='col' className={subHeaderClass}>Compiled</th>
          <th scope='col' className={subHeaderClass} title='Every deoptimization, including repeats at one location. The severity columns count locations.'>Total</th>
          <th scope='col' className={subHeaderClass}>Severity 1</th>
          <th scope='col' className={subHeaderClass}>Severity 2</th>
          <th scope='col' className={subHeaderClass}>Severity 3</th>
          <th scope='col' className={subHeaderClass}>Severity 1</th>
          <th scope='col' className={subHeaderClass}>Severity 2</th>
          <th scope='col' className={subHeaderClass}>Severity 3</th>
        </tr>
      </thead>
    )
  }

  /**
   * Render one file row and its optimization, deoptimization, and IC counts.
   * @param {{file: string, relativePath: string, deoptSeverities: number[], deoptCount: number, icSeverities: number[], codeStates: number[]}} data
   * @returns {import('preact').ComponentChildren}
   */
  _renderFile({ file, relativePath, deoptSeverities, deoptCount, icSeverities, codeStates }) {
    const { selectedFile } = this.props

    // Optimized = 3, Compile = 0, but we show them in order of serverity, so we reverse
    const codeColumns = coloredTds(codeStates.reverse())
    const deoptColumns = coloredTds(deoptSeverities.slice(1))
    const icColumns = coloredTds(icSeverities.slice(1))

    const onfileClicked = this._onfileClicked.bind(this, file)
    const selectedClass = file === selectedFile ? 'bg-light-yellow' : ''
    return (
      <tr key={relativePath} className={'normalrow ' + selectedClass}>
        <td class='underlined'>
          <a className={'items pl2 pr2'}
            href='#'
            title={relativePath}
            onClick={/** @param {import('preact').TargetedMouseEvent<HTMLAnchorElement>} e */ e => {
              e.preventDefault()
              onfileClicked()
            }}>
            {relativePath}
          </a>
        </td>
        {codeColumns}
        <td className={' pl2 pr2 tr' + underlineTdClass}>{deoptCount}</td>
        {deoptColumns}
        {icColumns}
      </tr>
    )
  }

  /**
   * @param {string} file
   * @returns {void}
   */
  _onfileClicked(file) {
    const { onfileClicked } = this.props
    onfileClicked(file)
  }
}

module.exports = { FilesView }
