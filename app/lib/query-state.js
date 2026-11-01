'use strict'

/* global location */
function parseNum(s) {
  return s === '' ? null : parseInt(s)
}

function parseBool(s) {
  return s === 'true'
}

function stateFromUrl() {
  if (location.search == null || location.search.length < 2) return null
  const query = location.search.slice(1)
  const queryState = new URLSearchParams(query)
  const state = {
      includeAllSeverities  : parseBool(queryState.get('includeAllSeverities'))
    , selectedFileIdx       : parseNum(queryState.get('selectedFileIdx'))
    , selectedLocation      : parseNum(queryState.get('selectedLocation'))
    , selectedTabIdx        : parseNum(queryState.get('selectedTabIdx'))
    , selectedSummaryTabIdx : parseNum(queryState.get('selectedSummaryTabIdx'))
  }
  return state
}

function urlFromState(state) {
  const rootUrl = location.origin
  const path = location.pathname
  const queryParams = new URLSearchParams()
  Object.keys(state).forEach((key) => {
    if (state[key] !== undefined) queryParams.append(key, state[key] == null ? '' : state[key])
  })
  const queryString = queryParams.toString()
  const url = `${rootUrl}${path}?${queryString}`
  return url
}

module.exports = {
    stateFromUrl
  , urlFromState
}
