'use strict'

const { test } = require('node:test')

const MarkerResolver = require('../lib/rendering/marker-resolver')

/**
 * @param {number} line
 * @param {number} column
 * @param {number} id
 * @param {1 | 2 | 3} [severity]
 * @param {boolean} [isScript]
 * @returns {[string, {id: number, severity: 1 | 2 | 3, line: number, column: number, isScript?: boolean | undefined}]}
 */
function marker (line, column, id, severity = 3, isScript) {
  return [ `run:${line}:${column}`, { id, severity, line, column, isScript } ]
}

/**
 * @param {ReturnType<typeof marker>[]} markers
 * @returns {{map: Map<string, ReturnType<typeof marker>[1]>, locations: string[]}}
 */
function markers (markers) {
  const map = new Map(markers)
  return { map, locations: Array.from(map.keys()) }
}

test('MarkerResolver requires locations for each marker map', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  const { map } = markers([ marker(1, 1, 0) ])
  t.assert.throws(() => new MarkerResolver({ ics: map }), /locations for ics/)
  t.assert.throws(() => new MarkerResolver({ deopts: map }), /locations for deopts/)
  t.assert.throws(() => new MarkerResolver({ codes: map }), /locations for codes/)
})

test('MarkerResolver resolves nothing without marker data', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const resolver = new MarkerResolver({})
  t.assert.equal(resolver.nextLocation(), null, 'has no next location')
  t.assert.deepEqual(resolver.resolve({ line: 1, column: 1 }), { insertBefore: '', insertAfter: '' }, 'renders no markers')
})

test('MarkerResolver walks all marker kinds in source order', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(7)
  const ics = markers([ marker(3, 1, 0) ])
  const deopts = markers([ marker(1, 5, 1), marker(2, 1, 2) ])
  const codes = markers([ marker(1, 2, 3) ])
  const resolver = new MarkerResolver({
    ics: ics.map,
    icLocations: ics.locations,
    deopts: deopts.map,
    deoptLocations: deopts.locations,
    codes: codes.map,
    codeLocations: codes.locations,
    selectedLocation: 2
  })

  t.assert.deepEqual(resolver.nextLocation(), { functionName: 'run', line: 1, column: 2 }, 'starts at the earliest marker')
  t.assert.deepEqual(resolver.resolve({ line: 1, column: 1 }), { insertBefore: '', insertAfter: '' }, 'stops before a later column')
  t.assert.match(resolver.resolve({ line: 1, column: 2 }).insertAfter, /data-markertype="code"/, 'renders the code marker')
  t.assert.match(resolver.resolve({ line: 1, column: 5 }).insertAfter, /data-markertype="deopt"/, 'renders the deopt marker')
  t.assert.match(resolver.resolve({ line: 2, column: 1 }).insertAfter, /dark-red selected/, 'marks the selected location')
  t.assert.deepEqual(resolver.nextLocation(), { functionName: 'run', line: 3, column: 1 }, 'advances to the last marker')
  t.assert.match(resolver.resolve({ line: 3, column: 1 }).insertAfter, /data-markertype="ic"/, 'renders the inline cache marker')
})

test('MarkerResolver prefers the earlier of two locations on a line', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  const earlier = markers([ marker(1, 2, 0) ])
  const later = markers([ marker(1, 5, 1) ])
  const lowerLine = markers([ marker(2, 1, 2) ])

  t.assert.equal(new MarkerResolver({
    ics: later.map, icLocations: later.locations, deopts: earlier.map, deoptLocations: earlier.locations
  }).nextLocation()?.column, 2, 'chooses the lower column')
  t.assert.equal(new MarkerResolver({
    ics: earlier.map, icLocations: earlier.locations, deopts: later.map, deoptLocations: later.locations
  }).nextLocation()?.column, 2, 'keeps the current lower column')
  t.assert.equal(new MarkerResolver({
    ics: earlier.map, icLocations: earlier.locations, deopts: lowerLine.map, deoptLocations: lowerLine.locations
  }).nextLocation()?.line, 1, 'keeps the current lower line')
})

test('MarkerResolver can hide minimum severity markers', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const deopts = markers([ marker(1, 1, 0, 1), marker(2, 1, 1, 2) ])
  const resolver = new MarkerResolver({
    deopts: deopts.map,
    deoptLocations: deopts.locations,
    ics: null,
    icLocations: null,
    includeAllSeverities: false
  })

  t.assert.deepEqual(resolver.nextLocation(), { functionName: 'run', line: 2, column: 1 }, 'skips the low severity location')
  t.assert.match(resolver.resolve({ line: 2, column: 1 }).insertAfter, /blue/, 'renders the remaining marker')
})

test('MarkerResolver places a script wrapper marker before the source', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const codes = markers([ marker(1, 1, 0, 3, true) ])
  const resolver = new MarkerResolver({ codes: codes.map, codeLocations: codes.locations })
  t.assert.match(resolver.resolve({ line: 1, column: 1 }).insertBefore, /data-markertype="code"/)
})

test('MarkerResolver renders a marker left behind on an earlier line', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const deopts = markers([ marker(1, 9, 0) ])
  const resolver = new MarkerResolver({ deopts: deopts.map, deoptLocations: deopts.locations })
  t.assert.match(resolver.resolve({ line: 2, column: 1 }).insertAfter, /data-markertype="deopt"/)
})

test('MarkerResolver skips a location missing from its map', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const resolver = new MarkerResolver({ deopts: new Map(), deoptLocations: [ 'run:1:1' ] })
  t.assert.deepEqual(resolver.resolve({ line: 1, column: 1 }), { insertBefore: '', insertAfter: '' })
})
