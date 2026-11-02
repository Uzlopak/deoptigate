'use strict'

const { test } = require('node:test')
const DeoptEntry = require('../lib/log-processing/deopt-entry')
const summarizeFile = require('../lib/grouping/summarize-file')

function vector(...updates) {
  return { updates }
}

function criticalInput(category, severity) {
  const data = { ics: new Map(), deopts: new Map(), codes: new Map() }
  const updates = [ { severity, state: 0 } ]
  const collection = category === 'ic' ? data.ics
    : category === 'deopt' ? data.deopts
      : data.codes
  collection.set('sample', { updates })
  return data
}

test('unknown deopt kinds are counted conservatively in file summaries', (t) => {
  t.plan(4)
  const entry = new DeoptEntry('run /src/app.js', '/src/app.js', 12, 4)
  entry.addUpdate(1, 'future-kind', 'reason', -1, -1)

  const summary = summarizeFile({
    ics: new Map(),
    deopts: new Map([ [ 'run:12:4', entry ] ]),
    codes: new Map()
  })

  t.assert.equal(entry.updates[0].severity, 3, 'unknown bailout gets the highest severity')
  t.assert.deepEqual(summary.deoptSeverities, [ 0, 0, 0, 1 ], 'summary counts it in the highest bucket')
  t.assert.equal(summary.severityScore, 30, 'summary score reflects the conservative severity')
  t.assert.equal(summary.hasCriticalSeverities, true, 'summary flags the unknown bailout for review')
})

test('summarizeFile counts all severity buckets and final code states', (t) => {
  t.plan(8)
  const data = {
    ics: new Map([
      [ 'ic-soft', vector({ severity: 1 }) ],
      [ 'ic-lazy', vector({ severity: 1 }, { severity: 2 }) ],
      [ 'ic-eager', vector({ severity: 2 }, { severity: 3 }) ]
    ]),
    deopts: new Map([
      [ 'deopt-soft', vector({ severity: 1 }) ],
      [ 'deopt-lazy', vector({ severity: 1 }, { severity: 2 }) ],
      [ 'deopt-eager', vector({ severity: 2 }, { severity: 3 }) ]
    ]),
    codes: new Map([
      [ 'code-optimized', vector({ severity: 1, state: 0 }) ],
      [ 'code-optimizable', vector({ severity: 2, state: 1 }) ],
      [ 'code-compiled', vector({ severity: 3, state: 2 }) ],
      [ 'code-many-updates', vector(
        { severity: 1, state: 0 },
        { severity: 1, state: 1 },
        { severity: 1, state: 0 },
        { severity: 1, state: 2 }
      ) ]
    ])
  }

  const summary = summarizeFile(data)
  t.assert.deepEqual(summary.icSeverities, [ 0, 1, 1, 1 ], 'IC entries occupy all severity buckets')
  t.assert.deepEqual(summary.deoptSeverities, [ 0, 1, 1, 1 ], 'deopt entries occupy all severity buckets')
  t.assert.deepEqual(summary.codeSeverities, [ 0, 1, 1, 2 ], 'code entries include the repeated-update escalation')
  t.assert.deepEqual(summary.codeStates, [ 1, 1, 2 ], 'counts each code entry by its last state')
  t.assert.equal(summary.severityScore, 153, 'combines weighted severity counts')
  t.assert.equal(summary.hasCriticalSeverities, true, 'flags critical severities')
  t.assert.equal(data.codes.get('code-optimized').severity, 1, 'short update list retains its lowest severity')
  t.assert.equal(data.codes.get('code-many-updates').severity, 3, 'long update list escalates to severity three')
})

test('summarizeFile checks each category when deciding whether severity is critical', (t) => {
  t.plan(8)
  const cases = [
    [ 'ic', 2 ], [ 'ic', 3 ],
    [ 'deopt', 2 ], [ 'deopt', 3 ],
    [ 'code', 2 ], [ 'code', 3 ]
  ]

  for (const [ category, severity ] of cases) {
    const summary = summarizeFile(criticalInput(category, severity))
    t.assert.equal(summary.hasCriticalSeverities, true, `${category} severity ${severity} is critical`)
  }

  const empty = summarizeFile({ ics: new Map(), deopts: new Map(), codes: new Map() })
  t.assert.equal(empty.hasCriticalSeverities, false, 'no data is not critical')
  t.assert.equal(empty.severityScore, 0, 'empty data has a zero score')
})
