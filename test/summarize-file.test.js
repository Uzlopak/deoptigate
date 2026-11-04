'use strict'

const { test } = require('node:test')
const DeoptEntry = require('../lib/log-processing/deopt-entry')
const summarizeFile = require('../lib/grouping/summarize-file')

/** @typedef {{severity: import('../lib/severities').Severity, state?: import('../lib/log-processing/optimization-state').ParsedOptimizationState}} SummaryUpdate */
/** @typedef {{updates: SummaryUpdate[], severity?: number}} SummaryEntry */
/** @typedef {{updates: Array<SummaryUpdate & {state: import('../lib/log-processing/optimization-state').ParsedOptimizationState}>, severity?: number}} CodeSummaryEntry */
/**
 * @typedef {object} SummaryFixture
 * @property {Map<string, SummaryEntry>} ics
 * @property {Map<string, SummaryEntry>} deopts
 * @property {Map<string, CodeSummaryEntry>} codes
 */

/**
 * @param {...SummaryUpdate} updates
 * @returns {{updates: SummaryUpdate[], severity?: number}}
 */
function vector (...updates) {
  return { updates }
}

/**
 * @param {...(SummaryUpdate & {state: import('../lib/log-processing/optimization-state').ParsedOptimizationState})} updates
 * @returns {CodeSummaryEntry}
 */
function codeVector (...updates) {
  return { updates }
}

/**
 * @param {Map<string, SummaryEntry>} entries
 * @param {string} key
 * @returns {SummaryEntry}
 */
function getEntry (entries, key) {
  const entry = entries.get(key)
  if (entry == null) throw new Error(`missing summary fixture entry: ${key}`)
  return entry
}

/**
 * @param {'ic' | 'deopt' | 'code'} category
 * @param {import('../lib/severities').Severity} severity
 */
/**
 * @param {'ic' | 'deopt' | 'code'} category
 * @param {number} severity
 * @returns {SummaryFixture}
 */
function criticalInput (category, severity) {
  const data = { ics: new Map(), deopts: new Map(), codes: new Map() }
  const updates = [{ severity, state: 0 }]
  const collection = category === 'ic'
    ? data.ics
    : category === 'deopt'
      ? data.deopts
      : data.codes
  collection.set('sample', { updates })
  return data
}

test('unknown deopt kinds are counted conservatively in file summaries', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  const entry = new DeoptEntry('run /src/app.js', '/src/app.js', 12, 4)
  entry.addUpdate(1, 'future-kind', 'reason', -1, -1)

  const summary = summarizeFile({
    ics: new Map(),
    deopts: new Map([['run:12:4', entry]]),
    codes: new Map()
  })

  t.assert.equal(entry.updates[0].severity, 3, 'unknown bailout gets the highest severity')
  t.assert.deepEqual(summary.deoptSeverities, [0, 0, 0, 1], 'summary counts it in the highest bucket')
  t.assert.equal(summary.severityScore, 30, 'summary score reflects the conservative severity')
  t.assert.equal(summary.hasCriticalSeverities, true, 'summary flags the unknown bailout for review')
})

test('summarizeFile does not escalate a function for tiering up', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const summary = summarizeFile({
    ics: new Map(),
    deopts: new Map(),
    codes: new Map([['tiering', codeVector(
      { severity: 2, state: 1 },
      { severity: 2, state: 1 },
      { severity: 1, state: 2 },
      { severity: 1, state: 2 }
    )]])
  })
  t.assert.deepEqual(summary.codeSeverities, [0, 1, 0, 0])
})

test('summarizeFile counts every deopt, not only deopt locations', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const summary = summarizeFile({
    ics: new Map(),
    deopts: new Map([
      ['repeated', vector({ severity: 3 }, { severity: 3 }, { severity: 3 })],
      ['single', vector({ severity: 1 })]
    ]),
    codes: new Map()
  })

  t.assert.deepEqual(summary.deoptSeverities, [0, 1, 0, 1], 'severity buckets still count locations')
  t.assert.equal(summary.deoptCount, 4, 'deoptCount includes repeats at one location')
})

test('summarizeFile counts all severity buckets and final code states', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(8)
  /** @type {SummaryFixture} */
  const data = {
    ics: new Map([
      ['ic-soft', vector({ severity: 1 })],
      ['ic-lazy', vector({ severity: 1 }, { severity: 2 })],
      ['ic-eager', vector({ severity: 2 }, { severity: 3 })]
    ]),
    deopts: new Map([
      ['deopt-soft', vector({ severity: 1 })],
      ['deopt-lazy', vector({ severity: 1 }, { severity: 2 })],
      ['deopt-eager', vector({ severity: 2 }, { severity: 3 })]
    ]),
    codes: new Map([
      ['code-optimized', codeVector({ severity: 1, state: 0 })],
      ['code-optimizable', codeVector({ severity: 2, state: 1 })],
      ['code-compiled', codeVector({ severity: 3, state: 2 })],
      ['code-many-updates', codeVector(
        { severity: 1, state: 2 },
        { severity: 1, state: 2 },
        { severity: 1, state: 2 },
        { severity: 1, state: 2 }
      )]
    ])
  }

  const summary = summarizeFile(data)
  t.assert.deepEqual(summary.icSeverities, [0, 1, 1, 1], 'IC entries occupy all severity buckets')
  t.assert.deepEqual(summary.deoptSeverities, [0, 1, 1, 1], 'deopt entries occupy all severity buckets')
  t.assert.deepEqual(summary.codeSeverities, [0, 1, 1, 2], 'code entries include the repeated-update escalation')
  t.assert.deepEqual(summary.codeStates, [1, 1, 2], 'counts each code entry by its last state')
  t.assert.equal(summary.severityScore, 153, 'combines weighted severity counts')
  t.assert.equal(summary.hasCriticalSeverities, true, 'flags critical severities')
  t.assert.equal(getEntry(data.codes, 'code-optimized').severity, 1, 'short update list retains its lowest severity')
  t.assert.equal(getEntry(data.codes, 'code-many-updates').severity, 3, 'long update list escalates to severity three')
})

test('summarizeFile checks each category when deciding whether severity is critical', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(8)
  /** @type {Array<['ic' | 'deopt' | 'code', number]>} */
  const cases = [
    ['ic', 2], ['ic', 3],
    ['deopt', 2], ['deopt', 3],
    ['code', 2], ['code', 3]
  ]

  for (const [category, severity] of cases) {
    const summary = summarizeFile(criticalInput(category, severity))
    t.assert.equal(summary.hasCriticalSeverities, true, `${category} severity ${severity} is critical`)
  }

  const empty = summarizeFile({ ics: new Map(), deopts: new Map(), codes: new Map() })
  t.assert.equal(empty.hasCriticalSeverities, false, 'no data is not critical')
  t.assert.equal(empty.severityScore, 0, 'empty data has a zero score')
})
