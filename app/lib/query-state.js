'use strict'

/* global location */
/**
 * @typedef {object} QueryState
 * @property {boolean} includeAllSeverities
 * @property {number | null} selectedFileIdx
 * @property {number | null} selectedLocation
 * @property {number | null} selectedTabIdx
 * @property {number | null} selectedSummaryTabIdx
 */

/**
 * @param {string | null} s
 * @returns {number | null}
 */
function parseNum(s) {
  if (s == null || s.trim() === '') return null
  const value = Number(s)
  return Number.isSafeInteger(value) ? value : null
}

/**
 * @param {string | null} s
 * @returns {boolean}
 */
function parseBool(s) {
  return s === 'true'
}

/** @returns {QueryState | null} */
function stateFromUrl() {
  if (location.search.length < 2) return null
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

/**
 * Replace a missing or invalid selected index with its default.
 *
 * @param {number | null} value
 * @param {number[]} validValues
 * @param {number} defaultValue
 * @returns {number}
 */
function normalizeIndex(value, validValues, defaultValue) {
  return value != null && validValues.includes(value) ? value : defaultValue
}

/**
 * Merge URL state onto a fresh copy of the view defaults.
 *
 * @template {object} T
 * @param {T} defaults
 * @param {Partial<T> | null} urlState
 * @returns {T}
 */
function mergeInitialState(defaults, urlState) {
  return Object.assign({}, defaults, urlState)
}

/**
 * @param {{[K in keyof QueryState]?: QueryState[K] | undefined}} state
 * @returns {string}
 */
function urlFromState(state) {
  const rootUrl = location.origin
  const path = location.pathname
  const queryParams = new URLSearchParams()
  Object.entries(state).forEach(([key, value]) => {
    if (value !== undefined) queryParams.append(key, value == null ? '' : String(value))
  })
  const queryString = queryParams.toString()
  const url = `${rootUrl}${path}?${queryString}`
  return url
}

module.exports = {
    stateFromUrl
  , normalizeIndex
  , mergeInitialState
  , urlFromState
}
