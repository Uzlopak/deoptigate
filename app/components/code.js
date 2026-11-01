'use strict'

const Preact = require('preact')
const { Component } = Preact
const assert = require('../../lib/assert')
const scrollIntoView = require('scroll-into-view-if-needed')
const { highlight } = require('peacock')

const Theme = require('../theme.browser')
const MarkerResolver = require('../../lib/rendering/marker-resolver')

const markOnly = require('../../lib/rendering/mark-only')
const escapeHtml = require('../../lib/rendering/escape-html')

const MAX_HIGHLIGHT_LEN = 1E5

class CodeView extends Component {
  constructor(props) {
    super(props)

    const { onmarkerClicked } = props
    assert.equal(typeof onmarkerClicked, 'function', 'need to pass onmarkerClicked function')
    this._rootRef = Preact.createRef()
    this._bind()
  }

  _bind() {
    this._onmarkerClicked = this._onmarkerClicked.bind(this)
  }

  _maybeScrollIntoView() {
    const { selectedLocation } = this.props
    if (selectedLocation == null) return
    const code = document.getElementById(`code-location-${selectedLocation}`)
    if (code == null) return
    scrollIntoView(code, { behavior: 'smooth', scrollMode: 'if-needed' })
  }

  componentDidMount() {
    const rootEl = this._rootRef.current
    rootEl.addEventListener('click', event => {
      const tgt = event.target
      const { markerid, markertype } = tgt.dataset
      if (markerid == null) return
      event.preventDefault()
      event.stopPropagation()
      this._onmarkerClicked(parseInt(markerid), markertype)
    })
    this._maybeScrollIntoView()
  }

  componentDidUpdate() {
    this._maybeScrollIntoView()
  }

  shouldComponentUpdate(nextProps) {
    const props = this.props
    return (
         props.code !== nextProps.code
      || props.selectedLocation !== nextProps.selectedLocation
      || props.includeAllSeverities !== nextProps.includeAllSeverities
    )
  }

  render() {
    const {
        className = ''
      , ics
      , deopts
      , codes
      , icLocations
      , deoptLocations
      , codeLocations
      , selectedLocation
      , includeAllSeverities
    } = this.props

    const markerResolver = new MarkerResolver({
        deopts
      , deoptLocations
      , ics
      , icLocations
      , codes
      , codeLocations
      , selectedLocation
      , includeAllSeverities
    })

    const theme = new Theme(markerResolver).theme
    const highlightedCode = this._tryHighlightCode(theme, markerResolver)
    return (
      <div ref={this._rootRef} className={className}>
        <div dangerouslySetInnerHTML={{__html: highlightedCode}} />
      </div>
    )
  }

  _tryHighlightCode(theme, markerResolver) {
    const { fileName, code } = this.props
    const nohighlight = code.length > MAX_HIGHLIGHT_LEN
    if (nohighlight) return markOnly(code, markerResolver)
    try {
      try {
        // Highlighting without jsx support allows peacock to only parse out tokens
        // which is faster than building the AST
        const jsx = fileName.endsWith('jsx')
        return highlight(code, { theme, linenos: true, jsx })
      } catch (err) {
        // Higlighting without jsx option failed, try again
        return highlight(code, { theme, linenos: true, jsx: true })
      }
    } catch (err) {
      // Highlighting failed alltogether
      try {
        return markOnly(code, markerResolver)
      } catch (innerErr) {
        // Even marking only failed, just show the code :(
        return `
          <p>Deoptigate was unable to highlight/mark the below code</p>
          <pre style='white-space: pre'>${escapeHtml(code)}</pre>
        `
      }
    }
  }

  _onmarkerClicked(id, type) {
    const { onmarkerClicked } = this.props
    onmarkerClicked(id, type)
  }
}

module.exports = {
  CodeView
}
