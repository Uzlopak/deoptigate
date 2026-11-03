'use strict'

const Preact = require('preact')
const { Component } = Preact

const assert = require('../../lib/assert')

/**
 * @typedef {object} ToolbarViewProps
 * @property {string=} className
 * @property {boolean} includeAllSeverities
 * @property {(includeAllSeverities: boolean) => void} onincludeAllSeveritiesChanged
 */

/** @extends {Component<ToolbarViewProps>} */
class ToolbarView extends Component {
  /** @param {ToolbarViewProps} props */
  constructor(props) {
    super(props)
    const { onincludeAllSeveritiesChanged } = props
    assert.equal(typeof onincludeAllSeveritiesChanged, 'function', 'need to pass onincludeAllSeveritiesChanged function')
    this._bind()
  }

  /** @returns {void} */
  _bind() {
    this._onincludeAllSeveritiesToggled = this._onincludeAllSeveritiesToggled.bind(this)
  }

  /** @returns {import('preact').JSX.Element} */
  render() {
    const { className = '' } = this.props
    return (
      <div className={className}>
        {this._renderSeverityOption()}
      </div>
    )
  }

  /** @returns {import('preact').JSX.Element} */
  _renderSeverityOption() {
    const { includeAllSeverities } = this.props
    return (
      <label className='severity-option'>
        Include low severities
        <input
          className='severity-checkbox'
          type='checkbox'
          checked={!!includeAllSeverities}
          onChange={this._onincludeAllSeveritiesToggled} />
      </label>
    )
  }

  /**
   * @param {import('preact').TargetedEvent<HTMLInputElement>} e
   * @returns {void}
   */
  _onincludeAllSeveritiesToggled(e) {
    const { onincludeAllSeveritiesChanged } = this.props
    onincludeAllSeveritiesChanged(e.currentTarget.checked)
  }

}

module.exports = {
  ToolbarView
}
