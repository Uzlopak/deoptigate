'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')
const test = require('node:test')

/** @typedef {FakeElement} FakeChild */
/** @typedef {{target?: FakeElement, key?: string, preventDefault?: () => void, stopPropagation?: () => void}} FakeEvent */

/** Minimal DOM element model used to execute the visualizer in a VM. */
class FakeElement {
  /** @param {string} tagName */
  constructor (tagName) {
    this.tagName = tagName
    /** @type {FakeElement[]} */
    this.children = []
    /** @type {Record<string, string>} */
    this.attributes = {}
    /** @type {Record<string, string>} */
    this.dataset = {}
    /** @type {Record<string, string>} */
    this.style = {}
    /** @type {Record<string, (event: FakeEvent) => void>} */
    this.listeners = {}
    this.value = ''
    this._scrollTop = 0
    this.clientHeight = 400
    this.open = false
    this.tabIndex = 0
    this.focused = false
    this.id = ''
    this.className = ''
    this.type = ''
    this._textContent = ''
    /** @type {{block?: string} | undefined} */
    this.scrollIntoViewOptions = undefined
  }

  /** @returns {string} */
  get textContent () {
    return this._textContent + this.children.map(child => child.textContent || '').join('')
  }

  get scrollTop () {
    return this._scrollTop
  }

  set scrollTop (value) {
    const maximum = Math.max(0, this.scrollHeight - this.clientHeight)
    this._scrollTop = Math.max(0, Math.min(Number(value) || 0, maximum))
  }

  /** @returns {number} */
  get scrollHeight () {
    if (this.className !== 'deoptigate-source') return this.clientHeight
    return 32 + this.children.reduce((height, child) => {
      const spacerHeight = Number.parseFloat(child.style && child.style.height) || 0
      if (child.className === 'deoptigate-source-lines') {
        const rowsHeight = child.children.reduce((total, row) => {
          const rows = row.tagName === '#document-fragment' ? row.children : [row]
          return total + rows.reduce((rowTotal, line) => rowTotal + (Number.parseFloat(line.style && line.style.height) || 19), 0)
        }, 0)
        return height + rowsHeight
      }
      return height + spacerHeight
    }, 0)
  }

  /** @returns {{left: number, right: number}} */
  getBoundingClientRect () {
    return { left: 0, right: 0 }
  }

  set textContent (text) {
    this._textContent = String(text)
    this.children = []
  }

  /** @param {...FakeElement} nodes */
  append (...nodes) {
    this.children.push(...nodes)
  }

  /**
   * @param {FakeElement} node
   * @returns {FakeElement}
   */
  appendChild (node) {
    this.children.push(node)
    return node
  }

  /**
   * @param {FakeElement} node
   * @param {FakeElement} reference
   * @returns {FakeElement}
   */
  insertBefore (node, reference) {
    const index = this.children.indexOf(reference)
    this.children.splice(index === -1 ? this.children.length : index, 0, node)
    return node
  }

  /**
   * @param {FakeElement} node
   * @returns {FakeElement}
   */
  removeChild (node) {
    const index = this.children.indexOf(node)
    if (index !== -1) this.children.splice(index, 1)
    return node
  }

  /** @param {...FakeElement} nodes */
  replaceChildren (...nodes) {
    this.children = nodes
  }

  /**
   * @param {string} name
   * @param {string} value
   */
  setAttribute (name, value) {
    this.attributes[name] = value
  }

  /**
   * @param {string} type
   * @param {(event: FakeEvent) => void} listener
   */
  addEventListener (type, listener) {
    this.listeners[type] = listener
  }

  /**
   * @param {string} type
   * @param {Partial<FakeEvent>} [event]
   */
  dispatch (type, event = {}) {
    if (this.listeners[type]) this.listeners[type]({ target: this, ...event })
  }

  focus () {
    this.focused = true
  }

  /** @param {{block?: string}} options */
  scrollIntoView (options) {
    this.scrollIntoViewOptions = options
  }
}

/**
 * @param {FakeElement | null | undefined} node
 * @param {string} id
 * @returns {FakeElement | null}
 */
function findById (node, id) {
  if (!node || !node.children) return null
  if (node.id === id) return node
  for (const child of node.children) {
    const match = findById(child, id)
    if (match) return match
  }
  return null
}

/**
 * @param {FakeElement | null | undefined} node
 * @param {string} className
 * @returns {FakeElement[]}
 */
function findByClass (node, className) {
  if (!node || !node.children) return []
  const matches = String(node.className || '').split(/\s+/).includes(className) ? [node] : []
  for (const child of node.children) matches.push(...findByClass(child, className))
  return matches
}

/** @typedef {{get: (key: string) => FakeElement}} VisualizerNodes */
/**
 * @param {Map<string, FakeElement>} nodes
 * @param {string} id
 * @returns {FakeElement}
 */
function requireNode (nodes, id) {
  const node = nodes.get(id)
  if (node == null) throw new Error(`missing test DOM node: ${id}`)
  return node
}

/**
 * @param {FakeElement | null | undefined} node
 * @returns {FakeElement}
 */
function requireElement (node) {
  if (node == null) throw new Error('expected a test DOM element')
  return node
}

/**
 * @template T
 * @param {T | undefined} value
 * @returns {T}
 */
function requireDefined (value) {
  if (value === undefined) throw new Error('expected a defined test value')
  return value
}

/**
 * @param {unknown} data
 * @returns {VisualizerNodes}
 */
function createVisualizer (data) {
  /** @type {Map<string, FakeElement>} */
  const nodes = new Map()
  for (const id of ['clinic-data', 'deoptigate-files', 'deoptigate-details', 'deoptigate-search', 'deoptigate-severity']) {
    nodes.set(id, new FakeElement('div'))
  }
  requireNode(nodes, 'clinic-data').textContent = JSON.stringify(data)
  for (const value of ['1', '2', '3']) {
    const button = new FakeElement('button')
    button.dataset.severity = value
    button.setAttribute('aria-pressed', 'true')
    requireNode(nodes, 'deoptigate-severity').appendChild(button)
  }

  const document = {
    /** @param {string} tagName */
    createElement: tagName => new FakeElement(tagName),
    createDocumentFragment: () => new FakeElement('#document-fragment'),
    /** @param {string} text */
    createTextNode: text => {
      const node = new FakeElement('#text')
      node.textContent = String(text)
      return node
    },
    /**
     * @param {string} id
     * @returns {FakeElement | null}
     */
    getElementById (id) {
      return nodes.get(id) || findById(nodes.get('deoptigate-details'), id)
    }
  }
  const window = {
    requestAnimationFrame: (/** @type {() => void} */ callback) => callback()
  }
  const script = fs.readFileSync(path.join(__dirname, '../visualizer/main.js'), 'utf8')
  vm.runInNewContext(script, { document, window })
  return { get: id => requireNode(nodes, id) }
}

/** @typedef {{severity: number, bailoutType?: string, deoptReason?: string, type?: string, oldState?: number, newState?: number, key?: string, state?: number}} VisualUpdate */
/** @typedef {{line: number, column?: number, isScript?: boolean, updates: VisualUpdate[]}} VisualEvent */
/** @typedef {{relativePath: string, deopts: VisualEvent[], ics: VisualEvent[], codes: VisualEvent[], src: string}} VisualFileData */
/** @returns {Array<[string, VisualFileData]>} */
function sampleData () {
  return [
    ['/app/low.js', {
      relativePath: 'low.js',
      deopts: [{ line: 1, updates: [{ severity: 1, bailoutType: 'eager', deoptReason: 'low impact' }] }],
      ics: [],
      codes: [],
      src: 'const low = true'
    }],
    ['/app/high.js', {
      relativePath: 'high.js',
      deopts: [
        { line: 3, updates: [{ severity: 2, bailoutType: 'eager', deoptReason: 'medium impact' }] },
        { line: 5, updates: [{ severity: 3, bailoutType: 'eager', deoptReason: 'high impact' }] }
      ],
      ics: [{ line: 7, updates: [{ severity: 3, type: 'LoadIC' }] }],
      codes: [],
      src: 'const high = true'
    }]
  ]
}

test('event categories expose accessible tabs and support arrow-key navigation', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(8)
  const nodes = createVisualizer(sampleData())
  let tabs = findByClass(nodes.get('deoptigate-details'), 'deoptigate-tab')
  const tablist = findByClass(nodes.get('deoptigate-details'), 'deoptigate-tabs')[0]
  t.assert.equal(tablist.attributes.role, 'tablist', 'groups categories as a tablist')
  t.assert.equal(tabs[1].attributes.role, 'tab', 'exposes each category as a tab')
  t.assert.equal(tabs[1].tabIndex, 0, 'makes the selected tab the keyboard entry point')
  const eventPanel = requireElement(findById(nodes.get('deoptigate-details'), 'deoptigate-event-panel'))
  t.assert.equal(eventPanel.attributes.role, 'tabpanel', 'labels the event content as the tab panel')
  t.assert.equal(eventPanel.attributes['aria-labelledby'], tabs[1].id, 'associates the panel with the selected tab')

  let prevented = false
  tabs[1].dispatch('keydown', { key: 'ArrowRight', preventDefault: () => { prevented = true } })
  tabs = findByClass(nodes.get('deoptigate-details'), 'deoptigate-tab')
  t.assert.ok(prevented, 'prevents the page from scrolling when moving between tabs')
  t.assert.equal(tabs[2].attributes['aria-selected'], 'true', 'moves to the next category with ArrowRight')
  t.assert.equal(tabs[2].focused, true, 'keeps keyboard focus on the newly selected tab')
})

test('repeated event updates collapse and render on demand', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(5)
  const nodes = createVisualizer([
    ['/app/repeats.js', {
      relativePath: 'repeats.js',
      deopts: [{
        line: 1,
        column: 1,
        functionName: 'run',
        updates: [1, 2, 3].map(timestamp => ({ timestamp: timestamp * 1000, severity: 3, bailoutType: 'eager', deoptReason: 'wrong map' }))
      }],
      ics: [],
      codes: [],
      src: 'run()'
    }]
  ])
  const details = nodes.get('deoptigate-details')
  const card = findByClass(details, 'deoptigate-event')[0]
  const history = findByClass(card, 'deoptigate-event-history')[0]
  t.assert.equal(findByClass(card, 'deoptigate-event-meta').length, 1, 'shows one representative update by default')
  t.assert.equal(history.open, false, 'keeps repeated details collapsed initially')
  t.assert.equal(history.children[0].textContent, 'Show 2 more updates', 'makes the hidden event count clear')

  history.open = true
  history.dispatch('toggle')
  t.assert.equal(findByClass(card, 'deoptigate-event-meta').length, 3, 'loads every update when the user expands the history')
  history.dispatch('toggle')
  t.assert.equal(findByClass(card, 'deoptigate-event-meta').length, 3, 'does not duplicate history when reopened')
})

test('file deopt counts include repeats at one location', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const nodes = createVisualizer([
    ['/app/repeats.js', {
      relativePath: 'repeats.js',
      deopts: [{
        line: 1,
        column: 1,
        functionName: 'run',
        updates: [1, 2, 3].map(timestamp => ({ timestamp, severity: 3, bailoutType: 'eager', deoptReason: 'wrong map' }))
      }],
      ics: [],
      codes: [],
      src: 'run()'
    }]
  ])

  t.assert.match(nodes.get('deoptigate-files').textContent, /3 deopts/)
})

test('severity filter keeps file list, tabs and event rows in sync', (/** @type {import('node:test').TestContext} */ t) => {
  const nodes = createVisualizer(sampleData())
  const fileList = nodes.get('deoptigate-files')
  const details = nodes.get('deoptigate-details')
  const severityButtons = nodes.get('deoptigate-severity').children
  /** @param {string} value */
  const selectOnlySeverity = value => {
    for (const button of severityButtons) {
      const shouldBeActive = button.dataset.severity === value
      if ((button.attributes['aria-pressed'] === 'true') !== shouldBeActive) button.dispatch('click')
    }
  }

  t.assert.deepEqual(severityButtons.map(button => button.attributes['aria-pressed']), ['true', 'true', 'true'], 'starts with each severity enabled')
  t.assert.equal(findByClass(fileList, 'deoptigate-file').length, 2, 'shows both files initially')
  t.assert.ok(findByClass(fileList, 'deoptigate-file')[0].attributes['aria-current'] === 'true', 'selects the highest-ranked file shown first')
  t.assert.equal(findByClass(details, 'deoptigate-event').length, 2, 'shows events for the highest-ranked file')

  selectOnlySeverity('3')
  t.assert.deepEqual(severityButtons.map(button => button.attributes['aria-pressed']), ['false', 'false', 'true'], 'allows only high severity to remain enabled')
  t.assert.equal(findByClass(fileList, 'deoptigate-file').length, 1, 'keeps files with severity 3')
  t.assert.equal(findByClass(fileList, 'deoptigate-files-heading')[0].textContent, '1 source file', 'updates the visible file count')
  t.assert.ok(fileList.textContent.includes('high.js'), 'selects the remaining matching file')
  t.assert.equal(findByClass(details, 'deoptigate-event').length, 1, 'shows only the severity 3 deopt')
  t.assert.equal(findByClass(details, 'deoptigate-tab-count')[1].textContent, '1', 'updates tab counts')
  t.assert.ok(findByClass(details, 'deoptigate-muted')[0].textContent.includes('1 deoptimizations'), 'updates the selected file summary')

  selectOnlySeverity('2')
  t.assert.equal(findByClass(details, 'deoptigate-event').length, 1, 'filters to medium severity')

  selectOnlySeverity('1')
  t.assert.equal(findByClass(fileList, 'deoptigate-file').length, 1, 'filters to severity 1 files')
  t.assert.ok(fileList.textContent.includes('low.js'), 'selects the severity 1 file')
  t.assert.equal(findByClass(details, 'deoptigate-event').length, 1, 'shows only severity 1 events')

  requireElement(severityButtons.find(button => button.dataset.severity === '2')).dispatch('click')
  requireElement(severityButtons.find(button => button.dataset.severity === '3')).dispatch('click')
  t.assert.equal(findByClass(fileList, 'deoptigate-file').length, 2, 'restores all files')

  selectOnlySeverity('3')
  nodes.get('deoptigate-search').value = 'low.js'
  nodes.get('deoptigate-search').dispatch('input')
  t.assert.equal(findByClass(fileList, 'deoptigate-file').length, 0, 'allows combining severity and source filters')
  t.assert.ok(findByClass(details, 'deoptigate-empty')[0].textContent.includes('match these filters'), 'explains when filters hide every file')
  findByClass(details, 'deoptigate-clear-filters')[0].dispatch('click')
  t.assert.equal(findByClass(fileList, 'deoptigate-file').length, 2, 'clear filters restores every file')
  t.assert.deepEqual(severityButtons.map(button => button.attributes['aria-pressed']), ['true', 'true', 'true'], 'clear filters enables every severity')
  t.assert.equal(nodes.get('deoptigate-search').value, '', 'clear filters resets source search')
  t.assert.equal(nodes.get('deoptigate-search').focused, true, 'moves focus to the source filter after clearing filters')
})

test('severity filter applies to each deopt at a mixed-severity location', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(16)
  const nodes = createVisualizer([
    ['/app/mixed.js', {
      relativePath: 'mixed.js',
      deopts: [{
        line: 1,
        column: 1,
        functionName: 'run',
        updates: [
          { timestamp: 1, severity: 1, bailoutType: 'soft', deoptReason: 'low impact' },
          { timestamp: 2, severity: 3, bailoutType: 'eager', deoptReason: 'high impact' }
        ]
      }],
      ics: [],
      codes: [],
      src: 'run()'
    }]
  ])
  const fileList = nodes.get('deoptigate-files')
  const details = nodes.get('deoptigate-details')
  const severityButtons = nodes.get('deoptigate-severity').children
  /** @param {string} value */
  const toggle = value => requireElement(severityButtons.find(button => button.dataset.severity === value)).dispatch('click')
  /**
   * @param {string} severity
   * @param {string} reason
   * @param {string} hiddenReason
   */
  const assertOnly = (severity, reason, hiddenReason) => {
    const cards = findByClass(details, 'deoptigate-event')
    t.assert.match(fileList.textContent, /1 deopts/, 'file list counts only selected deopts')
    t.assert.match(details.textContent, /1 deoptimizations/, 'file heading counts only selected deopts')
    t.assert.equal(cards.length, 1, 'keeps the location visible')
    t.assert.equal(cards[0].dataset.severity, severity, 'card uses the selected deopt severity')
    t.assert.ok(details.textContent.includes(reason), 'shows the selected deopt')
    t.assert.ok(!details.textContent.includes(hiddenReason), 'hides the other deopt')
    t.assert.equal(findByClass(cards[0], 'deoptigate-event-history').length, 0, 'offers no hidden history')
  }

  t.assert.match(fileList.textContent, /2 deopts/, 'counts both deopts when every severity is selected')
  toggle('1')
  toggle('2')
  assertOnly('3', 'high impact', 'low impact')
  toggle('1')
  toggle('3')
  assertOnly('1', 'low impact', 'high impact')
  t.assert.equal(findByClass(details, 'deoptigate-source-marker')[0].dataset.severity, '1', 'source marker uses the selected deopt severity')
})

test('code event severity follows the summary rules across updates', (
  /** @type {import('node:test').TestContext} */ t
) => {
  const nodes = createVisualizer([
    ['/app/optimization-history.js', {
      relativePath: 'optimization-history.js',
      deopts: [],
      ics: [],
      codes: [
        {
          line: 1,
          column: 1,
          functionName: 'optimized',
          updates: [
            { severity: 2, state: 1 },
            { severity: 1, state: 2 }
          ]
        },
        {
          line: 2,
          column: 1,
          functionName: 'repeated',
          updates: [
            { severity: 1, state: 2 },
            { severity: 1, state: 2 },
            { severity: 1, state: 2 },
            { severity: 1, state: 2 }
          ]
        }
      ],
      src: 'function optimized () {}\nfunction repeated () {}'
    }]
  ])
  const details = nodes.get('deoptigate-details')
  const severityButtons = nodes.get('deoptigate-severity').children
  const eventSeverities = () => findByClass(details, 'deoptigate-event').map(event => event.dataset.severity)
  /**
   * @param {string} severity
   * @returns {void}
   */
  const selectOnlySeverity = severity => {
    for (const button of severityButtons) {
      const shouldBeActive = button.dataset.severity === severity
      if ((button.attributes['aria-pressed'] === 'true') !== shouldBeActive) button.dispatch('click')
    }
  }

  t.assert.deepEqual(eventSeverities(), ['1', '3'], 'uses the lowest code severity and escalates repeated updates')
  selectOnlySeverity('1')
  t.assert.deepEqual(eventSeverities(), ['1'], 'keeps optimized code when filtering for its final severity')
  t.assert.deepEqual(
    findByClass(details, 'deoptigate-source-marker').map(marker => marker.dataset.severity),
    ['1'],
    'applies the same severity to source markers'
  )

  selectOnlySeverity('3')
  t.assert.deepEqual(eventSeverities(), ['3'], 'filters repeated updates using their escalated severity')
})

test('selecting a file opens its most populated event category', (/** @type {import('node:test').TestContext} */ t) => {
  const nodes = createVisualizer([
    ['/app/inline-cache-heavy.js', {
      relativePath: 'inline-cache-heavy.js',
      deopts: [],
      codes: [{ line: 1, column: 1, updates: [{ severity: 2, state: 2 }] }],
      ics: [
        { line: 1, column: 2, updates: [{ severity: 1, oldState: 0, newState: 1 }] },
        { line: 1, column: 3, updates: [{ severity: 2, oldState: 1, newState: 2 }] }
      ],
      src: 'const value = 1'
    }],
    ['/app/deopt-heavy.js', {
      relativePath: 'deopt-heavy.js',
      deopts: [{ line: 1, column: 1, updates: [{ severity: 3, deoptReason: 'wrong map' }] }],
      codes: [],
      ics: [],
      src: 'function run () {}'
    }]
  ])
  const details = nodes.get('deoptigate-details')
  let selectedTab = requireElement(findByClass(details, 'deoptigate-tab').find(tab => tab.attributes['aria-selected'] === 'true'))

  t.assert.ok(selectedTab.textContent.startsWith('Inline caches'), 'starts on the category with the most events')
  t.assert.equal(findByClass(details, 'deoptigate-event').length, 2, 'shows the available inline cache events')
  findByClass(nodes.get('deoptigate-files'), 'deoptigate-file')[1].dispatch('click')
  t.assert.equal(findByClass(nodes.get('deoptigate-files'), 'deoptigate-file')[1].focused, true, 'keeps keyboard focus on the selected file after rerendering')
  selectedTab = requireElement(findByClass(details, 'deoptigate-tab').find(tab => tab.attributes['aria-selected'] === 'true'))
  t.assert.ok(selectedTab.textContent.startsWith('Deoptimizations'), 'switches to deoptimizations when the selected file has no inline cache events')
  t.assert.equal(findByClass(details, 'deoptigate-event').length, 1, 'shows the selected file’s deoptimization')
})

test('severity filtering ranks files by the events currently shown', (/** @type {import('node:test').TestContext} */ t) => {
  const nodes = createVisualizer([
    ['/app/hidden-high.js', {
      relativePath: 'hidden-high.js',
      deopts: [{ line: 1, column: 1, updates: [{ severity: 3, deoptReason: 'wrong map' }] }],
      codes: [],
      ics: [{ line: 1, column: 2, updates: [{ severity: 1, oldState: 0, newState: 1 }] }],
      src: 'const value = 1'
    }],
    ['/app/many-low.js', {
      relativePath: 'many-low.js',
      deopts: [1, 2, 3].map(column => ({ line: 1, column, updates: [{ severity: 1, deoptReason: 'not a Smi' }] })),
      codes: [],
      ics: [],
      src: 'const value = 1'
    }]
  ])
  const fileList = nodes.get('deoptigate-files')
  const severityButtons = nodes.get('deoptigate-severity').children

  t.assert.ok(findByClass(fileList, 'deoptigate-file')[0].textContent.includes('hidden-high.js'), 'all severities rank the high-impact file first')
  requireElement(severityButtons.find(button => button.dataset.severity === '2')).dispatch('click')
  requireElement(severityButtons.find(button => button.dataset.severity === '3')).dispatch('click')
  t.assert.ok(findByClass(fileList, 'deoptigate-file')[0].textContent.includes('many-low.js'), 'low severity ranks by the low-severity events now visible')
})

test('unresolved source files show a useful recovery hint', (/** @type {import('node:test').TestContext} */ t) => {
  const nodes = createVisualizer([])
  const fileList = nodes.get('deoptigate-files')
  const details = nodes.get('deoptigate-details')

  t.assert.equal(findByClass(fileList, 'deoptigate-files-heading')[0].textContent, '0 source files', 'reports that no source files were resolved')
  t.assert.ok(findByClass(details, 'deoptigate-empty')[0].textContent.includes('No source files were resolved'), 'explains why the details pane is empty')
  t.assert.ok(findByClass(details, 'deoptigate-empty-hint')[0].textContent.includes('project root'), 'suggests checking the profile project root')
})

test('large event lists render in pages and keep every event reachable', (/** @type {import('node:test').TestContext} */ t) => {
  const points = Array.from({ length: 31 }, (_, index) => ({
    line: index + 1,
    functionName: `function${index}`,
    updates: [{ severity: 1, bailoutType: 'eager', deoptReason: 'synthetic event' }]
  }))
  const nodes = createVisualizer([
    ['/app/large.js', { relativePath: 'large.js', deopts: points, ics: [], codes: [], src: 'const large = true' }]
  ])
  const details = nodes.get('deoptigate-details')

  t.assert.equal(findByClass(details, 'deoptigate-event').length, 30, 'renders the first page')
  t.assert.equal(findByClass(details, 'deoptigate-page-status')[0].textContent, 'Showing 1–30 of 31 events', 'shows the current range in a long event list')
  t.assert.equal(findByClass(details, 'deoptigate-page-status')[0].attributes.role, 'status', 'announces page changes to assistive technology')
  const showMore = findByClass(details, 'deoptigate-show-more')[0]
  t.assert.ok(showMore, 'offers a control for the remaining event')
  t.assert.match(showMore.textContent, /Show next 1 event \(1 remaining\)/, 'announces how many events remain')
  showMore.dispatch('click')
  t.assert.equal(findByClass(details, 'deoptigate-event').length, 1, 'moves to the remaining event page')
  t.assert.ok(findByClass(details, 'deoptigate-event-title')[0].textContent.includes('function30'), 'keeps the remaining event visible')
  t.assert.equal(findByClass(details, 'deoptigate-page-status')[0].textContent, 'Showing 31–31 of 31 events', 'updates the visible range on the next page')
  t.assert.equal(findByClass(details, 'deoptigate-show-more')[0].focused, true, 'keeps focus on the page control after moving forward')
  const showPrevious = findByClass(details, 'deoptigate-show-more')[0]
  t.assert.match(showPrevious.textContent, /Show previous 30 events/, 'offers navigation back to earlier events')
  showPrevious.dispatch('click')
  t.assert.equal(findByClass(details, 'deoptigate-event').length, 30, 'returns to the first event page')
  t.assert.equal(findByClass(details, 'deoptigate-page-status')[0].textContent, 'Showing 1–30 of 31 events', 'restores the visible range on the previous page')
  t.assert.equal(findByClass(details, 'deoptigate-show-more')[0].focused, true, 'keeps focus on the page control after moving back')
})

test('source code shows clickable markers at optimization event locations', (/** @type {import('node:test').TestContext} */ t) => {
  const nodes = createVisualizer([
    ['/app/markers.js', {
      relativePath: 'markers.js',
      deopts: [{ line: 2, column: 3, functionName: 'run', updates: [{ severity: 3, deoptReason: 'wrong map' }] }],
      codes: [{ line: 2, column: 3, functionName: 'run', updates: [{ severity: 2, state: 2 }] }],
      ics: [{ line: 3, column: 4, functionName: 'run', updates: [{ severity: 1, oldState: 0, newState: 1 }] }],
      src: 'first line\nconst value = run()\nreturn value'
    }]
  ])
  const details = nodes.get('deoptigate-details')
  const line = findByClass(details, 'deoptigate-source-line')[1]
  const sourceLines = findByClass(details, 'deoptigate-source-line')
  const markers = findByClass(line, 'deoptigate-source-marker')
  const code = findByClass(line, 'deoptigate-line-text')[0]
  const sourcePanel = findByClass(details, 'deoptigate-source')[0]

  t.assert.equal(sourcePanel.tabIndex, 0, 'makes the source panel keyboard scrollable')
  t.assert.equal(sourcePanel.attributes['aria-label'], 'Source code for markers.js', 'names the source region for assistive technology')
  t.assert.equal(sourceLines[0].style.height || '19px', '19px', 'keeps lines without markers at the normal line height')
  t.assert.equal(line.style.height || '19px', '19px', 'keeps marker lines on the same source row')
  t.assert.deepEqual(markers.map(marker => marker.textContent), ['▼', '▲'], 'shows deoptimization before optimization at their shared column')
  t.assert.deepEqual(
    markers.map(marker => marker.attributes['aria-label']),
    [ 'Deoptimization at line 2, column 3', 'Optimization at line 2, column 3' ],
    'gives each source marker an accessible event and location name'
  )
  t.assert.deepEqual(markers.map(marker => marker.dataset.severity), ['3', '2'], 'retains severity on each source marker')
  t.assert.equal(markers.every(marker => findByClass(code, 'deoptigate-source-marker-group')[0].children.includes(marker)), true, 'keeps markers grouped as inline source characters')
  const markerGroup = findByClass(code, 'deoptigate-source-marker-group')[0]
  t.assert.equal(markerGroup.dataset.column, '3', 'anchors the triangle group at its one-based source column')
  t.assert.equal(markerGroup.dataset.column, '3', 'places the inline marker at its one-based source column')
  t.assert.equal(code.children[0].textContent.replace(/[▲▼◆]/g, ''), 'const value = run()', 'keeps source text around inline markers')
  const sourceText = code.textContent.replace(/[▲▼◆]/g, '')
  t.assert.equal(sourceText, 'const value = run()', 'keeps each source character once at a shared marker column')
  markers[1].dispatch('click')
  const optimizationTab = requireElement(findByClass(details, 'deoptigate-tab').find(button => button.textContent.includes('Optimizations')))
  t.assert.equal(optimizationTab.attributes['aria-selected'], 'true', 'clicking an optimization marker selects its event category')
  t.assert.equal(findByClass(details, 'deoptigate-source-marker').some(marker => marker.focused), true, 'keeps focus on the selected source marker after rerendering')
  const selectedEvent = findByClass(details, 'deoptigate-event')[0]
  t.assert.equal(selectedEvent.dataset.selected, 'true', 'selects the matching event in the list')
  t.assert.equal(requireDefined(selectedEvent.scrollIntoViewOptions).block, 'center', 'scrolls the matching event into view')
  const inlineCacheMarkers = findByClass(findByClass(details, 'deoptigate-source-line')[2], 'deoptigate-source-marker')
  const inlineCacheCode = findByClass(findByClass(details, 'deoptigate-source-line')[2], 'deoptigate-line-text')[0]
  const inlineCacheGroup = findByClass(inlineCacheCode, 'deoptigate-source-marker-group')[0]
  t.assert.equal(inlineCacheMarkers[0].textContent, '◆', 'shows an inline-cache marker at its source location')
  t.assert.equal(inlineCacheMarkers[0].dataset.severity, '1', 'retains inline-cache severity')
  t.assert.equal(inlineCacheGroup.dataset.column, '4', 'places inline-cache markers at their one-based source column')
  inlineCacheMarkers[0].dispatch('click')
  const inlineCacheTab = requireElement(findByClass(details, 'deoptigate-tab').find(button => button.textContent.includes('Inline caches')))
  t.assert.equal(inlineCacheTab.attributes['aria-selected'], 'true', 'clicking an inline-cache marker selects its event category')
  requireElement(nodes.get('deoptigate-severity').children.find(button => button.dataset.severity === '1')).dispatch('click')
  requireElement(nodes.get('deoptigate-severity').children.find(button => button.dataset.severity === '2')).dispatch('click')
  const highSeverityMarkers = findByClass(findByClass(details, 'deoptigate-source-line')[1], 'deoptigate-source-marker')
  t.assert.deepEqual(highSeverityMarkers.map(marker => marker.textContent), ['▼'], 'severity filtering hides lower-severity source markers')
})

test('source markers preserve their V8 columns and keep source text visible', (/** @type {import('node:test').TestContext} */ t) => {
  const nodes = createVisualizer([
    ['/app/columns.js', {
      relativePath: 'columns.js',
      deopts: [{ line: 1, column: 3, updates: [{ severity: 3, deoptReason: 'wrong map' }] }],
      ics: [],
      codes: [{ line: 1, column: 12, updates: [{ severity: 2, state: 2 }] }],
      src: 'const value = run()'
    }]
  ])
  const code = findByClass(nodes.get('deoptigate-details'), 'deoptigate-line-text')[0]
  const groups = findByClass(code, 'deoptigate-source-marker-group')

  t.assert.deepEqual(groups.map(group => group.dataset.column), ['3', '12'], 'keeps each marker anchored to its source column')
  t.assert.deepEqual(groups.map(group => group.dataset.column), ['3', '12'], 'keeps inline markers at their V8 source columns')
  t.assert.deepEqual(groups.map(group => group.children[0].textContent), ['▼', '▲'], 'keeps marker buttons associated with their source locations')
  t.assert.equal(code.children[0].textContent.replace(/[▲▼◆]/g, ''), 'const value = run()', 'keeps source text around inline markers')
  t.assert.equal(code.children[0].style.paddingTop || '', '', 'keeps source text on its normal baseline')
  t.assert.equal(code.style.height || '19px', '19px', 'keeps marker lines at the normal line height')
  t.assert.equal(code.textContent.replace(/[▲▼◆]/g, ''), 'const value = run()', 'does not consume or duplicate source characters')
})

test('source markers follow the full token at a one-based V8 column', (/** @type {import('node:test').TestContext} */ t) => {
  const nodes = createVisualizer([
    ['/app/property.js', {
      relativePath: 'property.js',
      deopts: [],
      ics: [{ line: 1, column: 5, key: 'flag', updates: [{ severity: 1, oldState: 2, newState: 3 }] }],
      codes: [],
      src: 'obj.flag'
    }]
  ])
  const code = findByClass(nodes.get('deoptigate-details'), 'deoptigate-line-text')[0]
  const sourceText = code.children[0]
  const markerGroup = findByClass(code, 'deoptigate-source-marker-group')[0]

  t.assert.equal(sourceText.children[0].textContent, 'obj.flag', 'keeps the complete property token before the marker')
  t.assert.equal(sourceText.children[1], markerGroup, 'inserts the marker immediately after the property token')
  t.assert.equal(sourceText.children.length, 2, 'does not add an empty text node after the marker')
  t.assert.equal(markerGroup.dataset.column, '5', 'retains the original one-based V8 column')
  t.assert.equal(markerGroup.dataset.characterOffset, '8', 'positions the marker after the complete identifier token')
})

test('source markers follow Unicode identifiers to the end of the token', (
  /** @type {import('node:test').TestContext} */ t
) => {
  const nodes = createVisualizer([
    ['/app/unicode-property.js', {
      relativePath: 'unicode-property.js',
      deopts: [],
      ics: [{ line: 1, column: 5, key: 'π名', updates: [{ severity: 1, oldState: 1, newState: 2 }] }],
      codes: [],
      src: 'obj.π名'
    }]
  ])
  const code = findByClass(nodes.get('deoptigate-details'), 'deoptigate-line-text')[0]
  const sourceText = findByClass(code, 'deoptigate-source-text')[0]
  const markerGroup = findByClass(code, 'deoptigate-source-marker-group')[0]

  t.assert.equal(sourceText.children[0].textContent, 'obj.π名', 'keeps the complete Unicode identifier before the marker')
  t.assert.equal(sourceText.children[1], markerGroup, 'places the marker after the complete Unicode identifier')
  t.assert.equal(markerGroup.dataset.characterOffset, '6', 'uses the JavaScript source offset after both Unicode characters')
})

test('source markers stay at the parameter boundary after its opening parenthesis', (/** @type {import('node:test').TestContext} */ t) => {
  const nodes = createVisualizer([
    ['/app/parameter.js', {
      relativePath: 'parameter.js',
      deopts: [],
      ics: [],
      codes: [{ line: 1, column: 11, updates: [{ severity: 2, state: 2 }] }],
      src: 'function f(arg) {}'
    }]
  ])
  const sourceText = findByClass(nodes.get('deoptigate-details'), 'deoptigate-source-text')[0]
  const markerGroup = findByClass(sourceText, 'deoptigate-source-marker-group')[0]

  t.assert.equal(sourceText.children[0].textContent, 'function f(', 'keeps the marker after the opening parenthesis')
  t.assert.equal(sourceText.children[1], markerGroup, 'places the marker before the parameter name')
  t.assert.equal(sourceText.children[2].textContent, 'arg) {}', 'preserves the parameter and following source text')
})

test('script wrapper markers stay before the first source token', (/** @type {import('node:test').TestContext} */ t) => {
  const nodes = createVisualizer([
    ['/app/script.js', {
      relativePath: 'script.js',
      deopts: [],
      ics: [],
      codes: [{ line: 1, column: 1, isScript: true, updates: [{ severity: 2, state: 2 }] }],
      src: 'use strict'
    }]
  ])
  const sourceText = findByClass(nodes.get('deoptigate-details'), 'deoptigate-source-text')[0]
  const markerGroup = findByClass(sourceText, 'deoptigate-source-marker-group')[0]

  t.assert.equal(sourceText.children[0], markerGroup, 'places the script wrapper marker before the first token')
  t.assert.equal(sourceText.children[1].textContent, 'use strict', 'preserves the source after its wrapper marker')
})

test('source markers jump to event pages beyond the first page', (/** @type {import('node:test').TestContext} */ t) => {
  const points = Array.from({ length: 61 }, (_, index) => ({
    line: index + 1,
    column: 2,
    functionName: `function${index}`,
    updates: [{ severity: 2, state: 2 }]
  }))
  const source = points.map((_, index) => `const value${index} = ${index}`).join('\n')
  const nodes = createVisualizer([
    ['/app/many.js', { relativePath: 'many.js', deopts: [], ics: [], codes: points, src: source }]
  ])
  const details = nodes.get('deoptigate-details')
  const lastLineMarkers = findByClass(findByClass(details, 'deoptigate-source-line')[45], 'deoptigate-source-marker')

  lastLineMarkers[0].dispatch('click')

  const eventCards = findByClass(details, 'deoptigate-event')
  const target = requireElement(eventCards.find(card => card.textContent.includes('function45')))
  const sourcePanel = requireElement(findById(details, 'deoptigate-source'))
  const selectedSourceLine = requireElement(findByClass(details, 'deoptigate-source-line').find(line => line.attributes['aria-current'] === 'true'))
  t.assert.equal(eventCards.length, 30, 'keeps only one event page in the DOM')
  t.assert.ok(target, 'opens the page containing the clicked marker event')
  t.assert.equal(target.dataset.selected, 'true', 'marks the matching event as selected')
  t.assert.equal(requireDefined(target.scrollIntoViewOptions).block, 'center', 'scrolls the off-page event into view')
  t.assert.ok(sourcePanel.scrollTop > 0, 'scrolls the source panel to the clicked marker line')
  t.assert.equal(selectedSourceLine.children[0].textContent, '46', 'renders the clicked marker line as the current source line')
})
