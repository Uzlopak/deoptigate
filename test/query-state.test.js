'use strict'

const { test } = require('node:test')
const {
  stateFromUrl,
  normalizeIndex,
  mergeInitialState,
  urlFromState
} = require('../app/lib/query-state')

/**
 * Run a callback with a temporary browser location.
 *
 * @template T
 * @param {string} search
 * @param {() => T} callback
 * @returns {T}
 */
function withLocation (search, callback) {
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      search,
      origin: 'https://example.test',
      pathname: '/report.html'
    }
  })

  try {
    return callback()
  } finally {
    if (previousLocation == null) Reflect.deleteProperty(globalThis, 'location')
    else Object.defineProperty(globalThis, 'location', previousLocation)
  }
}

/**
 * Read query state with a temporary browser location.
 *
 * @param {string} search
 * @returns {ReturnType<typeof stateFromUrl>}
 */
function readState (search) {
  return withLocation(search, stateFromUrl)
}

test('stateFromUrl treats missing numeric query values as null', (
  /** @type {import('node:test').TestContext} */ t
) => {
  const state = readState('?includeAllSeverities=true')

  t.assert.ok(state, 'returns state for a nonempty query')
  t.assert.equal(state && state.selectedTabIdx, null, 'leaves missing tab selection unset for the default')
  t.assert.equal(state && state.selectedFileIdx, null, 'leaves missing file selection unset')
})

test('stateFromUrl returns null when the URL has no query string', (
  /** @type {import('node:test').TestContext} */ t
) => {
  t.assert.equal(readState(''), null, 'uses defaults when no query is present')
})

test('stateFromUrl rejects malformed numeric query values', (
  /** @type {import('node:test').TestContext} */ t
) => {
  const state = readState('?selectedTabIdx=2oops&selectedFileIdx=&selectedSummaryTabIdx=2')

  t.assert.ok(state, 'returns state for a nonempty query')
  t.assert.equal(state && state.selectedTabIdx, null, 'rejects a numeric prefix followed by invalid text')
  t.assert.equal(state && state.selectedFileIdx, null, 'treats an empty selection as unset')
  t.assert.equal(state && state.selectedSummaryTabIdx, 2, 'retains a valid integer selection')
})

test('normalizeIndex uses a default for indexes outside the known tabs', (
  /** @type {import('node:test').TestContext} */ t
) => {
  t.assert.equal(normalizeIndex(1, [0, 1], 0), 1, 'keeps a valid tab index')
  t.assert.equal(normalizeIndex(99, [0, 1], 0), 0, 'replaces an out-of-range tab index')
  t.assert.equal(normalizeIndex(null, [0, 1], 0), 0, 'replaces a missing tab index')
})

test('mergeInitialState restores URL state without mutating shared defaults', (
  /** @type {import('node:test').TestContext} */ t
) => {
  const defaults = { selectedFile: null, selectedTabIdx: 0, includeAllSeverities: false }
  const restored = mergeInitialState(defaults, { selectedTabIdx: 1 })

  t.assert.deepEqual(restored, {
    selectedFile: null,
    selectedTabIdx: 1,
    includeAllSeverities: false
  }, 'combines URL values with the complete default view state')
  t.assert.deepEqual(defaults, {
    selectedFile: null,
    selectedTabIdx: 0,
    includeAllSeverities: false
  }, 'keeps the shared defaults unchanged')
})

test('urlFromState serializes selected state and skips undefined values', (
  /** @type {import('node:test').TestContext} */ t
) => {
  const url = withLocation('?initial=true', () => urlFromState({
    includeAllSeverities: true,
    selectedFileIdx: null,
    selectedLocation: undefined,
    selectedTabIdx: 1
  }))

  t.assert.equal(
    url,
    'https://example.test/report.html?includeAllSeverities=true&selectedFileIdx=&selectedTabIdx=1',
    'serializes URL state and omits undefined fields'
  )
})
