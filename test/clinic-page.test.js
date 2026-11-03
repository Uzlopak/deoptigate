'use strict'

const test = require('node:test')
const fs = require('fs')
const createClinicPage = require('../src/clinic-page')

test('Clinic report data escapes script terminators and JavaScript line separators', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(9)
  /** @type {Buffer[]} */
  const chunks = []
  const stream = createClinicPage([
    ['file.js', { relativePath: '</script>\u2028\u2029' }]
  ], '1.0.0', undefined)
  /** @type {Promise<string>} */
  const htmlPromise = new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk))
    stream.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.once('error', reject)
  })
  const html = await htmlPromise
  const headerLogo = fs.readFileSync(require.resolve('../visualizer/logo-alt.svg'), 'utf8').trim()

  t.assert.ok(html.includes('\\u003c/script>'), 'escapes the opening tag delimiter')
  t.assert.ok(html.includes('\\u2028'), 'escapes the line separator')
  t.assert.ok(html.includes('\\u2029'), 'escapes the paragraph separator')
  t.assert.ok(html.includes('data:image/svg+xml;base64,'), 'embeds the supplied Clinic logo as a favicon')
  t.assert.ok(html.includes(headerLogo), 'uses the alternate logo in the Clinic navigation bar')
  t.assert.ok(html.includes('role="group" aria-label="Filter by severity"'), 'exposes severity filters as a labeled control group')
  t.assert.ok(html.includes('data-severity="1" aria-pressed="true" title="Severity 1">Low</button>'), 'shows the low severity option')
  t.assert.ok(html.includes('data-severity="2" aria-pressed="true" title="Severity 2">Medium</button>'), 'shows the medium severity option')
  t.assert.ok(html.includes('data-severity="3" aria-pressed="true" title="Severity 3">High</button>'), 'shows the high severity option')
})

test('Clinic report includes elapsed time when provided', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  /** @type {Buffer[]} */
  const chunks = []
  const stream = createClinicPage([], '1.0.0', '2.50s')
  /** @type {Promise<string>} */
  const htmlPromise = new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk))
    stream.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.once('error', reject)
  })
  const html = await htmlPromise
  t.assert.ok(html.includes('2.50s'), 'renders the elapsed time in the report header')
})
