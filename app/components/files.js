'use strict'

const Preact = require('preact')
const { Component } = Preact
const summarizeFile = require('../../lib/grouping/summarize-file')
const assert = require('../../lib/assert')

const severityClassNames = [
    'green i tc'
  , 'blue tc'
  , 'red b tc'
]

const underlineTdClass = ' pl2 pr2 underlined '

function coloredTds(arr) {
  return arr.map((x, idx) => {
    const className = x > 0
      ? severityClassNames[idx] + ' tr' + underlineTdClass
      : ' pl2 pr2 tc i gray' + underlineTdClass
    return <td key={idx} className={className}>{x}</td>
  })
}

function bySeverityScoreDesc({ summary: s1 }, { summary: s2 }) {
  return s1.severityScore < s2.severityScore ? 1 : -1
}

class FilesView extends Component {
  constructor(props) {
    super(props)
    const { onfileClicked } = props
    assert.equal(typeof onfileClicked, 'function', 'need to pass onfileClicked function')
  }

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
      const { icSeverities, deoptSeverities, codeStates } = summary
      const { relativePath } = groups.get(file)
      const rendered = this._renderFile({
          file
        , relativePath
        , icSeverities
        , deoptSeverities
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
          <td className='empty-table-state' colSpan='10'>{message}</td>
        </tr>
      )
    }

    return (
      <div className={className}>
        <table className='files-table' cellSpacing='0'>
          <colgroup>
            <col className='file-column' />
            <col span='9' className='metric-column' />
          </colgroup>
          {tableHeader}
          <tbody>{rows}</tbody>
        </table>
      </div>
    )
  }

  _renderTableHeader() {
    const topHeaderClass = 'tc header-row pt2 pb1 '
    const subHeaderClass = 'pa1 pl2 pr2 subhead'
    return (
      <thead>
        <tr>
          <th scope='col' rowSpan='2' className={topHeaderClass + ' file-header'}>File</th>
          <th scope='colgroup' colSpan='3' className={topHeaderClass}>Optimizations</th>
          <th scope='colgroup' colSpan='3' className={topHeaderClass}>Deoptimizations</th>
          <th scope='colgroup' colSpan='3' className={topHeaderClass}>Inline Caches</th>
        </tr>
        <tr>
          <th scope='col' className={subHeaderClass}>Optimized</th>
          <th scope='col' className={subHeaderClass}>Optimizable</th>
          <th scope='col' className={subHeaderClass}>Compiled</th>
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

  _renderFile({ file, relativePath, deoptSeverities, icSeverities, codeStates }) {
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
            onClick={e => {
              e.preventDefault()
              onfileClicked()
            }}>
            {relativePath}
          </a>
        </td>
        {codeColumns}
        {deoptColumns}
        {icColumns}
      </tr>
    )
  }

  _onfileClicked(file) {
    const { onfileClicked } = this.props
    onfileClicked(file)
  }
}

module.exports = { FilesView }
