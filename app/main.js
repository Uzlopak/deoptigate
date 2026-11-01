'use strict'

/* global history */

const Preact = require('preact')
const { Component, render } = Preact
const { deoptigate } = require('../')
const { urlFromState, stateFromUrl } = require('./lib/query-state')

const { ToolbarView } = require('./components/toolbar')
const { FilesView } = require('./components/files')
const { SummaryView } = require('./components/summary')
const { FileDetailsView } = require('./components/file-details')

const FILES_TAB_IDX = 0
const DETAILS_TAB_IDX = 1

function app() {
  // makes React happy
  document.body.innerHTML = ''
  const el = document.createElement('div')
  el.className = 'app-root'
  document.body.appendChild(el)
  return el
}

const initialState = {
    selectedFile: null
  , selectedLocation: null
  , selectedSummaryTabIdx: SummaryView.OPT_TAB_IDX
  , includeAllSeverities: false
  , selectedTabIdx: FILES_TAB_IDX
}

class MainView extends Component {
  constructor(props) {
    super(props)

    const { groups } = props
    this._indexedGroups = Array.from(groups)

    this._initialState = Object.assign(initialState, this._stateFromUrl())
    this.state = Object.assign({}, this._initialState)

    this._bind()
    window.onpopstate = this._restoreStateFromHistory
  }

  _bind() {
    this._onlocationSelected = this._onlocationSelected.bind(this)
    this._onsummaryTabIdxChanged = this._onsummaryTabIdxChanged.bind(this)
    this._onincludeAllSeveritiesChanged = this._onincludeAllSeveritiesChanged.bind(this)
    this._onfileClicked = this._onfileClicked.bind(this)
    this._updateUrl = this._updateUrl.bind(this)
    this._restoreStateFromHistory = this._restoreStateFromHistory.bind(this)
  }

  render() {
    const { includeAllSeverities } = this.state

    const tabs = this._renderTabs()
    return (
      <div className='center pa2 app-shell'>
        <div className='flex flex-row main-tabs'>
          {this._renderTabHeader('Files', FILES_TAB_IDX)}
          {this._renderTabHeader('Details', DETAILS_TAB_IDX)}
          <ToolbarView
            className='toolbar'
            includeAllSeverities={includeAllSeverities}
            onincludeAllSeveritiesChanged={this._onincludeAllSeveritiesChanged} />
        </div>
        {tabs}
      </div>
    )
  }

  /*
   * Tabs
   */

  _renderTabHeader(label, idx) {
    const { selectedTabIdx } = this.state
    const selected = idx === selectedTabIdx
    const baseClass = 'flex flex-column ttu dib link outline-0 tab-header main-tab'
    const selectedClass = 'tab-active'
    const unselectedClass = 'tab-inactive'
    const className = selected ? `${baseClass} ${selectedClass}` : `${baseClass} ${unselectedClass}`

    return (
      <a className={className} href='#' onClick={e => {
        e.preventDefault()
        this._ontabHeaderClicked(idx)
      }}>{label}</a>
    )
  }

  _renderTabs() {
    const { selectedTabIdx } = this.state
    const files = this._renderFiles(selectedTabIdx === FILES_TAB_IDX)
    const details = this._renderFileDetails(selectedTabIdx === DETAILS_TAB_IDX)
    return (
      <div className='flex flex-row view-tabs'>
        {files}
        {details}
      </div>
    )
  }

  /*
   * Contents
   */
  _renderFiles(selected) {
    const { groups } = this.props
    const { selectedFile, includeAllSeverities } = this.state
    const display = selected ? 'flex' : 'dn'
    const className = `${display} flex-row overflow-scroll pa2`

    return (
      <FilesView
        className={className}
        selectedFile={selectedFile}
        groups={groups}
        includeAllSeverities={includeAllSeverities}
        onfileClicked={this._onfileClicked} />
    )
  }

  _renderFileDetails(selected) {
    const { groups } = this.props
    const {
        selectedFile
      , selectedLocation
      , selectedSummaryTabIdx
      , includeAllSeverities
    } = this.state
    const display = selected ? 'flex' : 'dn'
    const className = `${display} flex-row details-view`
    if (selectedFile == null || !groups.has(selectedFile)) {
      return (
        <div className={`${className} empty-details`}>
          <div className='empty-details-card'>
            <h2>No file selected</h2>
            <p>Choose a file from Files to inspect its optimizations and deoptimizations.</p>
          </div>
        </div>
      )
    }

    return (
      <FileDetailsView
        groups={groups}
        selectedFile={selectedFile}
        selectedLocation={selectedLocation}
        selectedSummaryTabIdx={selectedSummaryTabIdx}
        includeAllSeverities={includeAllSeverities}
        className={className}
        onmarkerClicked={this._onlocationSelected}
        onsummaryClicked={this._onlocationSelected}
        onsummaryTabIdxChanged={this._onsummaryTabIdxChanged}
      />
    )
  }

  /*
   * URL State
   */
  _indexFromFile(file) {
    for (var i = 0; i < this._indexedGroups.length; i++) {
      const key = this._indexedGroups[i][0]
      if (key === file) return i
    }
    return -1
  }

  _fileFromIndex(idx) {
    if (idx < 0) return null
    if (this._indexedGroups[idx] == null) return null
    return this._indexedGroups[idx][0]
  }

  _updateUrl() {
    const {
        selectedFile
      , selectedLocation
      , includeAllSeverities
      , selectedTabIdx
      , selectedSummaryTabIdx
    } = this.state

    const state = {
        selectedFileIdx: this._indexFromFile(selectedFile)
      , selectedLocation
      , includeAllSeverities
      , selectedTabIdx
      , selectedSummaryTabIdx
    }
    try {
      history.pushState(state, 'deoptigate', urlFromState(state))
    } catch (e) {
      // some browsers like Safari block this in the name of security
      // if we opened the index file directly, i.e. the page isn't served
    }
  }

  _restoreStateFromHistory(e) {
    if (history.state == null) return null

    let {
        selectedFileIdx
      , selectedLocation
      , includeAllSeverities
      , selectedTabIdx
      , selectedSummaryTabIdx
    } = history.state
    if (selectedLocation === '') selectedLocation = null

    const selectedFile = this._fileFromIndex(selectedFileIdx)
    const override = {
        includeAllSeverities
      , selectedFile
      , selectedTabIdx
      , selectedLocation
      , selectedSummaryTabIdx
    }

    this.setState(Object.assign(this.state, override))
  }

  _stateFromUrl() {
    const state = stateFromUrl()
    if (state == null) return null
    const {
        selectedFileIdx
      , selectedLocation
      , includeAllSeverities
      , selectedTabIdx
      , selectedSummaryTabIdx
    } = state
    const selectedFile = this._fileFromIndex(selectedFileIdx)
    return {
        selectedFile
      , selectedLocation
      , includeAllSeverities
      , selectedTabIdx
      , selectedSummaryTabIdx
    }
  }

  /*
   * Events
   */
  _ontabHeaderClicked(idx) {
    this.setState(Object.assign(this.state, { selectedTabIdx: idx }), this._updateUrl)
  }

  _onlocationSelected(id) {
    this.setState(Object.assign(this.state, { selectedLocation: id }), this._updateUrl)
  }

  _onsummaryTabIdxChanged(idx) {
    this.setState(Object.assign(this.state, { selectedSummaryTabIdx: idx }), this._updateUrl)
  }

  _onincludeAllSeveritiesChanged(includeAllSeverities) {
    this.setState(Object.assign(this.state, { includeAllSeverities, selectedLocation: null }), this._updateUrl)
  }

  _onfileClicked(file) {
    this.setState(Object.assign(this.state, {
        selectedFile: file
      , selectedLocation: null
      // auto open details view when file is selected
      , selectedTabIdx: DETAILS_TAB_IDX
    }), this._updateUrl)
  }
}

async function deoptigateRender(groupedByFile) {
  try {
    const groupedByFileAndLocation = deoptigate(groupedByFile)

    render(
      <MainView groups={groupedByFileAndLocation} />
    , app()
    )
  } catch (err) {
    console.error(err)
  }
}

module.exports = deoptigateRender
