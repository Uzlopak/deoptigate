'use strict'

const fs = require('fs')
const { createRequire } = require('module')
const path = require('path')
const test = require('node:test')

const { fire, installDom } = require('./support/dom')

const APP = path.join(__dirname, '../app')
const skip = fs.existsSync(path.join(APP, 'node_modules/esbuild')) ? false : 'app dependencies are not installed'

/** @typedef {import('./support/dom').TestElement} TestElement */
/** @typedef {import('node:test').TestContext} TestContext */

/** @type {Array<{element: TestElement, options: unknown}>} */
const scrolled = []

/** Load the report's views with a recording scroll function, once. */
function load () {
  require('./support/jsx-hook')
  const appRequire = createRequire(path.join(APP, 'main.js'))
  const scrollPath = appRequire.resolve('scroll-into-view-if-needed')
  const scrollIntoView = (/** @type {TestElement} */ element, /** @type {unknown} */ options) => {
    scrolled.push({ element, options })
  }
  require.cache[scrollPath] = /** @type {NodeJS.Module} */ (/** @type {unknown} */ ({ id: scrollPath, filename: scrollPath, loaded: true, exports: scrollIntoView }))
  const Preact = appRequire('preact')
  Preact.options.debounceRendering = (/** @type {() => void} */ callback) => callback()
  return {
    Preact,
    deoptigateRender: require('../app/main'),
    ...require('../app/components/code'),
    ...require('../app/components/file-details'),
    ...require('../app/components/files'),
    ...require('../app/components/summary'),
    ...require('../app/components/toolbar')
  }
}

/** @type {ReturnType<typeof load>} */
let views

/**
 * @param {string} name
 * @param {(t: import('node:test').TestContext, dom: ReturnType<typeof installDom>) => void | Promise<void>} run
 * @param {{search?: string}} [options]
 */
function viewTest (name, run, options) {
  test(name, { skip }, async t => {
    views = views || load()
    scrolled.length = 0
    await run(t, installDom(options))
  })
}

/**
 * @param {ReturnType<typeof installDom>} dom
 * @param {*} Component
 * @param {object} props
 * @returns {{root: TestElement, update: (next: object) => void}}
 */
function mount (dom, Component, props) {
  const root = /** @type {TestElement} */ (/** @type {unknown} */ (document.createElement('div')))
  dom.body.appendChild(root)
  const update = (/** @type {object} */ next) => views.Preact.render(views.Preact.createElement(Component, { ...props, ...next }), root)
  update({})
  return { root, update }
}

/**
 * @template T
 * @param {T} [result]
 * @returns {((...args: unknown[]) => T) & {calls: unknown[][]}}
 */
function recorder (result) {
  /** @type {unknown[][]} */
  const calls = []
  return Object.assign((/** @type {unknown[]} */ ...args) => {
    calls.push(args)
    return /** @type {T} */ (result)
  }, { calls })
}

const point = (/** @type {number} */ id, /** @type {number} */ severity, /** @type {object[]} */ updates) => ({
  id, severity, functionName: `fn${id}`, line: id, column: 1, file: '/app/a.js', updates
})
const deopt = (/** @type {number} */ timestamp, /** @type {number} */ severity, inlined = false) => ({
  timestamp, severity, inlined, bailoutType: 'eager', deoptReason: `reason ${timestamp}`
})
const ic = (/** @type {number} */ severity) => ({ severity, oldState: 0, newState: 4, key: 'name', map: 'ab' })
const code = (/** @type {number} */ timestamp, /** @type {number} */ severity, state = 2) => ({ timestamp, severity, state })

/**
 * Build a located file group the way the report receives it.
 *
 * @param {{relativePath?: string, src?: string, deopts?: object[], ics?: object[], codes?: object[]}} [data]
 */
function group ({ relativePath = 'a.js', src = 'run()', deopts = [], ics = [], codes = [] } = {}) {
  const located = (/** @type {object[]} */ points) => new Map(points.map((p, index) => [ `key${index}`, p ]))
  const keys = (/** @type {object[]} */ points) => points.map((_, index) => `key${index}`)
  return {
    relativePath,
    src,
    deopts: located(deopts),
    deoptLocations: keys(deopts),
    ics: located(ics),
    icLocations: keys(ics),
    codes: located(codes),
    codeLocations: keys(codes)
  }
}

/* FilesView */

viewTest('the file table lists critical files, worst first, with their counts', (/** @type {TestContext} */ t, dom) => {
  const onfileClicked = recorder()
  const { root } = mount(dom, views.FilesView, {
    className: 'files',
    onfileClicked,
    includeAllSeverities: false,
    selectedFile: '/app/b.js',
    groups: new Map([
      [ '/app/quiet.js', group({ relativePath: 'quiet.js', deopts: [ point(1, 1, [ deopt(1, 1) ]) ] }) ],
      [ '/app/a.js', group({ relativePath: 'a.js', deopts: [ point(2, 2, [ deopt(2, 2) ]) ] }) ],
      [ '/app/b.js', group({ relativePath: 'b.js', deopts: [ point(3, 3, [ deopt(3, 3), deopt(4, 3) ]) ] }) ]
    ])
  })

  const rows = root.byClass('normalrow')
  t.assert.deepEqual(rows.map(row => row.byTag('a')[0].textContent), [ 'b.js', 'a.js' ], 'hides low severity and sorts by score')
  t.assert.ok(rows[0].className.includes('bg-light-yellow'), 'marks the selected file')
  t.assert.ok(!rows[1].className.includes('bg-light-yellow'))
  t.assert.deepEqual(rows[0].byTag('td').slice(4, 8).map(cell => cell.textContent), [ '2', '0', '0', '1' ], 'shows total and severities')
  t.assert.ok(rows[0].byTag('td')[7].className.includes('red'), 'colours non-zero severities')
  t.assert.ok(rows[0].byTag('td')[5].className.includes('gray'), 'greys zero counts')

  const event = fire(root.link('a.js'), 'click')
  t.assert.ok(event.defaultPrevented, 'does not follow the link')
  t.assert.deepEqual(onfileClicked.calls, [ [ '/app/a.js' ] ])
})

viewTest('the file table explains why it is empty', (/** @type {TestContext} */ t, dom) => {
  const props = { onfileClicked: recorder(), selectedFile: null, groups: new Map() }
  t.assert.match(mount(dom, views.FilesView, { ...props, includeAllSeverities: true }).root.textContent, /No files were found/)
  t.assert.match(mount(dom, views.FilesView, { ...props, includeAllSeverities: false }).root.textContent, /No files with critical events/)
})

viewTest('the file table requires a click handler', (/** @type {TestContext} */ t, dom) => {
  t.assert.throws(() => mount(dom, views.FilesView, { groups: new Map() }), /onfileClicked/)
})

/* ToolbarView */

viewTest('the toolbar reports the low severity toggle', (/** @type {TestContext} */ t, dom) => {
  const onincludeAllSeveritiesChanged = recorder()
  const { root } = mount(dom, views.ToolbarView, { includeAllSeverities: true, onincludeAllSeveritiesChanged })
  const checkbox = /** @type {HTMLInputElement} */ (/** @type {unknown} */ (root.byTag('input')[0]))
  t.assert.equal(checkbox.checked, true)

  checkbox.checked = false
  fire(checkbox, 'change')
  t.assert.deepEqual(onincludeAllSeveritiesChanged.calls, [ [ false ] ])
})

/* CodeView */

/**
 * @param {object} [overrides]
 * @returns {any}
 */
const codeProps = (overrides = {}) => ({
  ...group(),
  code: 'run()',
  fileName: '/app/a.js',
  selectedLocation: null,
  includeAllSeverities: false,
  onmarkerClicked: recorder(),
  ...overrides
})

/**
 * @param {TestElement} root
 * @returns {string}
 */
const htmlOf = root => root.innerHTML

viewTest('the code view highlights source and tolerates code it cannot parse', (/** @type {TestContext} */ t, dom) => {
  t.assert.match(htmlOf(mount(dom, views.CodeView, codeProps()).root), /class="highlight"/, 'highlights plain JavaScript')
  t.assert.match(htmlOf(mount(dom, views.CodeView, codeProps({ code: 'a = <div>b</div>', fileName: '/app/a.jsx' })).root), /class="highlight"/, 'highlights a jsx file')
  t.assert.match(htmlOf(mount(dom, views.CodeView, codeProps({ code: 'a = <div>b</div>' })).root), /class="highlight"/, 'retries JSX in a js file')

  const unparsable = htmlOf(mount(dom, views.CodeView, codeProps({ code: "'<b>" })).root)
  t.assert.ok(!unparsable.includes('highlight'), 'falls back to plain marking')
  t.assert.ok(unparsable.includes('&lt;b&gt;'), 'escapes the plain view')

  const long = htmlOf(mount(dom, views.CodeView, codeProps({ code: 'x'.repeat(100001) })).root)
  t.assert.ok(!long.includes('highlight'), 'does not highlight very long files')
})

viewTest('source text never becomes elements in the page', (/** @type {TestContext} */ t, dom) => {
  const payload = '<img src=x onerror=alert(1)>'
  for (const source of [
    `#!/usr/bin/env node ${payload}\nrun()`,
    `// ${payload}`,
    `const a = '${payload}'`,
    `const a = \`${payload}\``,
    `const a = /${payload}/`,
    `'${payload}`
  ]) {
    const { root } = mount(dom, views.CodeView, codeProps({ code: source }))
    t.assert.equal(root.querySelectorAll('img').length, 0, source)
    t.assert.ok(root.textContent.includes(payload), `shows ${source} as text`)
  }
})

viewTest('the code view shows escaped text when even marking fails', (/** @type {TestContext} */ t) => {
  const failing = () => { throw new Error('failed') }
  const html = views.CodeView.prototype._tryHighlightCode.call(
    { props: { fileName: 'a.js', code: '<b>' } },
    /** @type {any} */ ({ highlight: failing }),
    /** @type {any} */ ({ nextLocation: failing })
  )
  t.assert.match(html, /unable to highlight/)
  t.assert.ok(html.includes('&lt;b&gt;'))
})

viewTest('a click on a code marker selects it', (/** @type {TestContext} */ t, dom) => {
  const onmarkerClicked = recorder()
  const { root } = mount(dom, views.CodeView, codeProps({ onmarkerClicked }))
  const host = root.byTag('div')[0]
  const marker = document.createElement('a')
  marker.dataset.markerid = '7'
  marker.dataset.markertype = 'deopt'
  host.appendChild(marker)

  const reachedParent = recorder()
  dom.body.addEventListener('click', reachedParent)
  const event = fire(marker, 'click')
  t.assert.deepEqual(onmarkerClicked.calls, [ [ 7, 'deopt' ] ])
  t.assert.ok(event.defaultPrevented)
  t.assert.equal(reachedParent.calls.length, 0, 'stops the event')

  const plain = document.createElement('span')
  host.appendChild(plain)
  t.assert.equal(fire(plain, 'click').defaultPrevented, false, 'ignores other elements')
  fire(host.appendChild(document.createTextNode('text')), 'click')
  t.assert.equal(onmarkerClicked.calls.length, 1, 'ignores targets that are not elements')
})

viewTest('the code view scrolls to the selected location', (/** @type {TestContext} */ t, dom) => {
  const target = document.createElement('span')
  target.id = 'code-location-3'
  dom.body.appendChild(target)

  const { update } = mount(dom, views.CodeView, codeProps({ selectedLocation: 3 }))
  t.assert.deepEqual(scrolled.map(entry => entry.element), [ target ], 'scrolls when mounted')
  update({ selectedLocation: 4 })
  t.assert.equal(scrolled.length, 1, 'ignores a location missing from the page')
  update({ selectedLocation: 3 })
  t.assert.equal(scrolled.length, 2, 'scrolls after an update')
})

viewTest('the code view re-renders only for a visible change', (/** @type {TestContext} */ t) => {
  const props = codeProps()
  const update = views.CodeView.prototype.shouldComponentUpdate.bind({ props })
  t.assert.equal(update({ ...props }), false)
  t.assert.equal(update({ ...props, deopts: new Map() }), false, 'marker data alone is not a change')
  for (const change of [ { code: 'x' }, { fileName: 'x' }, { selectedLocation: 1 }, { includeAllSeverities: true } ]) {
    t.assert.equal(update({ ...props, ...change }), true, JSON.stringify(change))
  }
})

viewTest('the code view survives mounting without a root element', (/** @type {TestContext} */ t) => {
  t.assert.equal(views.CodeView.prototype.componentDidMount.call({ _rootRef: { current: null } }), undefined)
})

viewTest('the code view requires a marker handler', (/** @type {TestContext} */ t, dom) => {
  t.assert.throws(() => mount(dom, views.CodeView, codeProps({ onmarkerClicked: null })), /onmarkerClicked/)
})

/* SummaryView */

/**
 * @param {object} [overrides]
 * @returns {any}
 */
const summaryProps = (overrides = {}) => ({
  ...group({
    deopts: [ point(1, 3, [ deopt(1000, 3, true), deopt(2000, 1) ]) ],
    ics: [ point(2, 2, [ ic(2) ]) ],
    codes: [ point(3, 2, [ code(3000, 2) ]) ]
  }),
  selectedLocation: null,
  includeAllSeverities: false,
  relativePath: 'a.js',
  selectedTabIdx: 1,
  onsummaryClicked: recorder(),
  ontabHeaderClicked: recorder(),
  ...overrides
})

viewTest('the summary shows the details of each category', (/** @type {TestContext} */ t, dom) => {
  const { root } = mount(dom, views.SummaryView, summaryProps({ className: 'summary' }))
  const text = root.textContent
  t.assert.match(text, /fn1 at a\.js:1:1/)
  t.assert.match(text, /1mseager/)
  t.assert.match(text, /reason 1000yes/, 'marks an inlined deopt')
  t.assert.match(text, /reason 2000no/)
  t.assert.match(text, /name0xab/, 'lists the inline cache key and map')
  t.assert.match(text, /3ms/, 'lists code updates')
})

viewTest('the summary shows only the selected tab', (/** @type {TestContext} */ t, dom) => {
  const { root } = mount(dom, views.SummaryView, summaryProps({ selectedTabIdx: views.SummaryView.ICS_TAB_IDX }))
  const panels = root.byClass('summary-card').map(card => /** @type {HTMLElement} */ (card.parentElement))
  const visible = panels.filter(panel => !panel.className.split(' ').includes('dn'))
  t.assert.equal(visible.length, 1)
  t.assert.match(String(visible[0].textContent), /fn2/)
  t.assert.ok(root.link('Inline Caches').className.includes('tab-active'))
  t.assert.equal(root.link('Inline Caches').getAttribute('aria-current'), 'true')
  t.assert.ok(root.link('Deoptimizations').className.includes('tab-inactive'))
})

viewTest('summary tabs and locations report clicks', (/** @type {TestContext} */ t, dom) => {
  const ontabHeaderClicked = recorder()
  const onsummaryClicked = recorder()
  const { root } = mount(dom, views.SummaryView, summaryProps({ ontabHeaderClicked, onsummaryClicked }))

  t.assert.ok(fire(root.link('Inline Caches'), 'click').defaultPrevented)
  t.assert.deepEqual(ontabHeaderClicked.calls, [ [ views.SummaryView.ICS_TAB_IDX ] ])

  const reachedParent = recorder()
  dom.body.addEventListener('click', reachedParent)
  const event = fire(root.byClass('summary-location-link')[0], 'click')
  t.assert.ok(event.defaultPrevented)
  t.assert.equal(reachedParent.calls.length, 0, 'stops the event')
  t.assert.equal(onsummaryClicked.calls.length, 1)
})

viewTest('the summary hides low severities unless they are included', (/** @type {TestContext} */ t, dom) => {
  const low = { deopts: new Map([ [ 'key0', point(1, 1, [ deopt(1, 1) ]) ] ]), deoptLocations: [ 'key0' ] }
  const hidden = mount(dom, views.SummaryView, summaryProps(low)).root
  t.assert.ok(!hidden.textContent.includes('fn1'))
  t.assert.match(hidden.textContent, /No events match/, 'explains the empty category')

  const shown = mount(dom, views.SummaryView, summaryProps({ ...low, includeAllSeverities: true })).root
  t.assert.match(shown.textContent, /fn1/)
})

viewTest('the summary highlights the selected location and scrolls to it', (/** @type {TestContext} */ t, dom) => {
  const { root, update } = mount(dom, views.SummaryView, summaryProps({ selectedLocation: 1 }))
  t.assert.equal(root.byClass('bg-light-yellow').length, 1)
  t.assert.equal(scrolled.length, 1, 'scrolls when mounted')
  t.assert.equal(scrolled[0].element.id, 'summary-location-1')

  update({ selectedLocation: 99 })
  t.assert.equal(scrolled.length, 1, 'ignores a location missing from the page')
  update({ selectedLocation: 2 })
  t.assert.equal(scrolled.length, 2, 'scrolls after an update')
})

viewTest('the summary tolerates missing categories and stale locations', (/** @type {TestContext} */ t, dom) => {
  const { root } = mount(dom, views.SummaryView, summaryProps({
    ics: null, deopts: null, codes: null, icLocations: null, deoptLocations: null, codeLocations: null
  }))
  t.assert.equal(root.byClass('summary-card').length, 0)

  const stale = mount(dom, views.SummaryView, summaryProps({ deoptLocations: [ 'missing', 'key0' ] })).root
  t.assert.match(stale.textContent, /fn1/)
})

viewTest('the summary validates its props', (/** @type {TestContext} */ t, dom) => {
  t.assert.throws(() => mount(dom, views.SummaryView, summaryProps({ icLocations: null })), /locations for ics/)
  t.assert.throws(() => mount(dom, views.SummaryView, summaryProps({ deoptLocations: null })), /locations for deopts/)
  t.assert.throws(() => mount(dom, views.SummaryView, summaryProps({ onsummaryClicked: null })), /onsummaryClicked/)
  t.assert.throws(() => mount(dom, views.SummaryView, summaryProps({ ontabHeaderClicked: null })), /ontabHeaderClicked/)
})

/* FileDetailsView */

/**
 * @param {object} [overrides]
 * @returns {any}
 */
const detailProps = (overrides = {}) => ({
  groups: new Map([ [ '/app/a.js', group({ deopts: [ point(1, 3, [ deopt(1, 3) ]) ] }) ] ]),
  selectedFile: '/app/a.js',
  selectedLocation: null,
  includeAllSeverities: false,
  selectedSummaryTabIdx: 0,
  onsummaryClicked: recorder(),
  onmarkerClicked: recorder(),
  onsummaryTabIdxChanged: recorder(),
  ...overrides
})

viewTest('clicking a marker opens its summary tab', (/** @type {TestContext} */ t, dom) => {
  const onmarkerClicked = recorder()
  const onsummaryTabIdxChanged = recorder()
  const { root } = mount(dom, views.FileDetailsView, detailProps({ onmarkerClicked, onsummaryTabIdxChanged }))
  const host = root.byClass('code-view')[0].byTag('div')[0]
  const click = (/** @type {string} */ markertype) => {
    const marker = document.createElement('a')
    marker.dataset.markerid = '1'
    marker.dataset.markertype = markertype
    host.appendChild(marker)
    fire(marker, 'click')
  }

  click('code')
  t.assert.deepEqual(onsummaryTabIdxChanged.calls, [], 'already on the optimization tab')
  click('deopt')
  click('ic')
  t.assert.deepEqual(onsummaryTabIdxChanged.calls, [ [ views.SummaryView.DEOPT_TAB_IDX ], [ views.SummaryView.ICS_TAB_IDX ] ])
  t.assert.equal(onmarkerClicked.calls.length, 3)
})

viewTest('summary tab clicks reach the file details owner', (/** @type {TestContext} */ t, dom) => {
  const onsummaryTabIdxChanged = recorder()
  const { root } = mount(dom, views.FileDetailsView, detailProps({ onsummaryTabIdxChanged }))
  fire(root.link('Deoptimizations'), 'click')
  t.assert.deepEqual(onsummaryTabIdxChanged.calls, [ [ views.SummaryView.DEOPT_TAB_IDX ] ])
})

viewTest('file details validate their props and data', (/** @type {TestContext} */ t, dom) => {
  t.assert.throws(() => mount(dom, views.FileDetailsView, detailProps({ onsummaryTabIdxChanged: null })), /onsummaryTabIdxChanged/)
  t.assert.throws(() => mount(dom, views.FileDetailsView, detailProps({ selectedFile: '/missing.js' })), /missing grouped data/)
})

/* MainView */

/** @param {string} functionName */
const rawRecord = functionName => ({ functionName, file: '/app/a.js', line: 1, column: 1 })
const rawGroups = () => new Map([
  [ '/app/a.js', {
    relativePath: 'a.js',
    src: 'run()',
    ics: [],
    codes: [ { ...rawRecord('compiled'), isScript: false, updates: [ { timestamp: 1, state: 2, severity: 3 } ] } ],
    deopts: [ { ...rawRecord('run'), updates: [ { timestamp: 2000, bailoutType: 'eager', deoptReason: 'wrong map', inlined: false, severity: 3 } ] } ]
  } ],
  [ '/app/b.js', {
    relativePath: 'b.js',
    src: 'run()',
    ics: [],
    codes: [],
    deopts: [ { ...rawRecord('other'), file: '/app/b.js', updates: [ { timestamp: 3000, bailoutType: 'eager', deoptReason: 'wrong map', inlined: false, severity: 3 } ] } ]
  } ]
])

/**
 * @param {ReturnType<typeof installDom>} dom
 * @returns {Promise<TestElement>}
 */
async function renderApp (dom) {
  await views.deoptigateRender(rawGroups())
  return dom.body.byClass('app-root')[0]
}

/**
 * @param {ReturnType<typeof installDom>} dom
 * @param {object | null} state
 * @param {string} [url]
 */
function goBack (dom, state, url) {
  dom.history.replaceState(state, '', url)
  dom.window.dispatchEvent(new dom.window.Event('popstate'))
}

viewTest('the report starts on the file list with no file selected', async (/** @type {TestContext} */ t, dom) => {
  const app = await renderApp(dom)
  t.assert.ok(app.link('Files').className.includes('tab-active'))
  t.assert.deepEqual(app.byClass('normalrow').map(row => row.byTag('a')[0].textContent).sort(), [ 'a.js', 'b.js' ])
  t.assert.match(app.textContent, /No file selected/)
  t.assert.ok(app.byClass('empty-details')[0].className.includes('dn'), 'keeps details hidden')
})

viewTest('selecting a file opens its details and records the state', async (/** @type {TestContext} */ t, dom) => {
  const app = await renderApp(dom)
  fire(app.link('b.js'), 'click')

  t.assert.ok(app.link('Details').className.includes('tab-active'))
  t.assert.match(app.textContent, /other at b\.js/)
  t.assert.equal(dom.pushed.length, 1)
  const [ state, title, url ] = dom.pushed[0]
  t.assert.equal(title, 'deoptigate')
  t.assert.equal(/** @type {{selectedFileIdx: number}} */ (state).selectedFileIdx, 1)
  t.assert.match(String(url), /^http:\/\/report\/index\.html\?.*selectedFileIdx=1/)
})

viewTest('tabs, toolbar and summary update the report state', async (/** @type {TestContext} */ t, dom) => {
  const app = await renderApp(dom)
  fire(app.link('a.js'), 'click')
  fire(app.link('Files'), 'click')
  t.assert.ok(app.link('Files').className.includes('tab-active'), 'switches tabs')

  fire(app.link('Details'), 'click')
  fire(app.link('Deoptimizations'), 'click')
  t.assert.ok(app.link('Deoptimizations').className.includes('tab-active'), 'switches summary tabs')

  fire(app.byClass('summary-location-link')[1], 'click')
  const selected = dom.pushed[dom.pushed.length - 1][0]
  t.assert.equal(/** @type {{selectedLocation: number}} */ (selected).selectedLocation, 0, 'selects the location')

  const checkbox = /** @type {HTMLInputElement} */ (/** @type {unknown} */ (app.byTag('input')[0]))
  checkbox.checked = true
  fire(checkbox, 'change')
  const toggled = /** @type {{includeAllSeverities: boolean, selectedLocation: number | null}} */ (dom.pushed[dom.pushed.length - 1][0])
  t.assert.equal(toggled.includeAllSeverities, true)
  t.assert.equal(toggled.selectedLocation, null, 'clears the selection')
})

viewTest('opening details with no file selected records that state', async (/** @type {TestContext} */ t, dom) => {
  const app = await renderApp(dom)
  fire(app.link('Details'), 'click')
  t.assert.equal(/** @type {{selectedFileIdx: number}} */ (dom.pushed[0][0]).selectedFileIdx, -1)
  t.assert.match(app.textContent, /No file selected/)
})

viewTest('a blocked history API does not break the report', async (/** @type {TestContext} */ t, dom) => {
  const app = await renderApp(dom)
  dom.history.pushState = () => { throw new Error('blocked') }
  fire(app.link('a.js'), 'click')
  t.assert.ok(app.link('Details').className.includes('tab-active'))
})

viewTest('the report restores its state from the URL', async (/** @type {TestContext} */ t, dom) => {
  const app = await renderApp(dom)
  t.assert.ok(app.link('Details').className.includes('tab-active'))
  t.assert.match(app.textContent, /other at b\.js/)
  t.assert.ok(app.link('Inline Caches').className.includes('tab-active'))
}, { search: '?selectedFileIdx=1&selectedTabIdx=1&selectedSummaryTabIdx=2&includeAllSeverities=true' })

viewTest('the report ignores a URL pointing at no file or tab', async (/** @type {TestContext} */ t, dom) => {
  const app = await renderApp(dom)
  t.assert.ok(app.link('Files').className.includes('tab-active'))
  t.assert.match(app.textContent, /No file selected/)
}, { search: '?selectedFileIdx=9&selectedTabIdx=9&selectedSummaryTabIdx=9' })

viewTest('going back restores the recorded state', async (/** @type {TestContext} */ t, dom) => {
  const app = await renderApp(dom)
  fire(app.link('a.js'), 'click')
  goBack(dom, { selectedFileIdx: 1, selectedLocation: '', includeAllSeverities: true, selectedTabIdx: 1, selectedSummaryTabIdx: 1 })
  t.assert.match(app.textContent, /other at b\.js/)
  t.assert.ok(app.link('Deoptimizations').className.includes('tab-active'))
  fire(app.link('Deoptimizations'), 'click')
  const restored = /** @type {{selectedLocation: unknown}} */ (dom.pushed[dom.pushed.length - 1][0])
  t.assert.equal(restored.selectedLocation, null, 'reads an empty location as no selection')

  goBack(dom, { selectedFileIdx: -1, selectedLocation: 2, includeAllSeverities: false, selectedTabIdx: 0, selectedSummaryTabIdx: 0 })
  t.assert.match(app.textContent, /No file selected/)
})

viewTest('going back to the first entry restores the URL state', async (/** @type {TestContext} */ t, dom) => {
  const app = await renderApp(dom)
  fire(app.link('a.js'), 'click')
  goBack(dom, null, '/index.html')
  t.assert.ok(app.link('Files').className.includes('tab-active'))
})

viewTest('a failure while rendering is reported, not thrown', async (/** @type {TestContext} */ t) => {
  const error = t.mock.method(console, 'error', () => {})
  await views.deoptigateRender(/** @type {any} */ (new Map([ [ '/app/a.js', {} ] ])))
  t.assert.equal(error.mock.callCount(), 1)
})
