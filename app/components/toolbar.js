'use strict'

const Preact = require('preact')
const { Component } = Preact

const assert = require('../../lib/assert')

class ToolbarView extends Component {
  constructor(props) {
    super(props)
    const { onincludeAllSeveritiesChanged } = props
    assert.equal(typeof onincludeAllSeveritiesChanged, 'function', 'need to pass onincludeAllSeveritiesChanged function')
    this._bind()
  }

  _bind() {
    this._onincludeAllSeveritiesToggled = this._onincludeAllSeveritiesToggled.bind(this)
  }

  render() {
    const { className = '' } = this.props
    return (
      <div className={className}>
        {this._renderSeverityOption()}
      </div>
    )
  }

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

  _onincludeAllSeveritiesToggled(e) {
    const { onincludeAllSeveritiesChanged } = this.props
    onincludeAllSeveritiesChanged(e.target.checked)
  }

}

module.exports = {
  ToolbarView
}
