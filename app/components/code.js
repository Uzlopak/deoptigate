'use strict'

const Preact = require('preact')
const { Component } = Preact
const assert = require('../../lib/assert')
/**
 * @typedef {object} HighlightOptions
 * @property {InstanceType<typeof Theme>['theme']} theme
 * @property {boolean} linenos
 * @property {boolean} jsx
 */

/**
 * @type {typeof import('scroll-into-view-if-needed').default}
 */
const scrollIntoView = /** @type {typeof import('scroll-into-view-if-needed').default} */ (
  /** @type {unknown} */ (require('scroll-into-view-if-needed'))
)
/** @type {{highlight: (code: string, options: HighlightOptions) => string}} */
// @ts-expect-error Peacock does not provide a declaration file; its local API is typed here.
const peacock = require('peacock')
/** @type {(code: string, options: HighlightOptions) => string} */
const highlight = peacock.highlight

const Theme = require('../theme.browser')
const MarkerResolver = require('../../lib/rendering/marker-resolver')

const markOnly = require('../../lib/rendering/mark-only')
const escapeHtml = require('../../lib/rendering/escape-html')

const MAX_HIGHLIGHT_LEN = 1E5

/**
 * @typedef {object} CodeViewProps
 * @property {string} code
 * @property {string} fileName
 * @property {string=} className
 * @property {number | null=} selectedLocation
 * @property {boolean} includeAllSeverities
 * @property {Map<string, CodeMarkerInfo>} ics
 * @property {Map<string, CodeMarkerInfo>} deopts
 * @property {Map<string, CodeMarkerInfo>} codes
 * @property {string[]} icLocations
 * @property {string[]} deoptLocations
 * @property {string[]} codeLocations
 * @property {(id: number, type: string | undefined) => void} onmarkerClicked
 */

/**
 * @typedef {object} CodeMarkerInfo
 * @property {number} id
 * @property {import('../../lib/severities').Severity} severity
 * @property {boolean | undefined} [isScript]
 * @property {number} line
 * @property {number} column
 */

/** @extends {Component<CodeViewProps>} */
class CodeView extends Component {
  /** @param {CodeViewProps} props */
  constructor(props) {
    super(props)

    const { onmarkerClicked } = props
    assert.equal(typeof onmarkerClicked, 'function', 'need to pass onmarkerClicked function')
    /** @type {import('preact').RefObject<HTMLDivElement | null>} */
    this._rootRef = Preact.createRef()
    this._bind()
  }

  /** @returns {void} */
  _bind() {
    this._onmarkerClicked = this._onmarkerClicked.bind(this)
  }

  /** @returns {void} */
  _maybeScrollIntoView() {
    const { selectedLocation } = this.props
    if (selectedLocation == null) return
    const code = document.getElementById(`code-location-${selectedLocation}`)
    if (code == null) return
    scrollIntoView(code, { behavior: 'smooth', scrollMode: 'if-needed' })
  }

  /**
   * @override
   * @returns {void}
   */
  componentDidMount() {
    const rootEl = this._rootRef.current
    if (rootEl == null) return
    rootEl.addEventListener('click', event => {
      const tgt = event.target
      if (!(tgt instanceof HTMLElement)) return
      const { markerid, markertype } = tgt.dataset
      if (markerid == null) return
      event.preventDefault()
      event.stopPropagation()
      this._onmarkerClicked(parseInt(markerid), markertype)
    })
    this._maybeScrollIntoView()
  }

  /**
   * @override
   * @returns {void}
   */
  componentDidUpdate() {
    this._maybeScrollIntoView()
  }

  /**
   * @override
   * @param {CodeViewProps} nextProps
   * @returns {boolean}
   */
  shouldComponentUpdate(nextProps) {
    const props = this.props
    return (
         props.code !== nextProps.code
      || props.selectedLocation !== nextProps.selectedLocation
      || props.includeAllSeverities !== nextProps.includeAllSeverities
    )
  }

  /**
   * @override
   * @returns {import('preact').JSX.Element}
   */
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

  /**
   * @param {InstanceType<typeof Theme>['theme']} theme
   * @param {InstanceType<typeof MarkerResolver>} markerResolver
   * @returns {string}
   */
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

  /**
   * @param {number} id
   * @param {string | undefined} type
   * @returns {void}
   */
  _onmarkerClicked(id, type) {
    const { onmarkerClicked } = this.props
    onmarkerClicked(id, type)
  }
}

module.exports = {
  CodeView
}
