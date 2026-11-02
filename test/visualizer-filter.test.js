'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')
const test = require('tape')

class FakeElement {
  constructor (tagName) {
    this.tagName = tagName
    this.children = []
    this.attributes = {}
    this.dataset = {}
    this.style = {}
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
  }

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

  set textContent (text) {
    this._textContent = String(text)
    this.children = []
  }

  append (...nodes) {
    this.children.push(...nodes)
  }

  appendChild (node) {
    this.children.push(node)
    return node
  }

  insertBefore (node, reference) {
    const index = this.children.indexOf(reference)
    this.children.splice(index === -1 ? this.children.length : index, 0, node)
    return node
  }

  removeChild (node) {
    const index = this.children.indexOf(node)
    if (index !== -1) this.children.splice(index, 1)
    return node
  }

  replaceChildren (...nodes) {
    this.children = nodes
  }

  setAttribute (name, value) {
    this.attributes[name] = value
  }

  addEventListener (type, listener) {
    this.listeners[type] = listener
  }

  dispatch (type, event = {}) {
    if (this.listeners[type]) this.listeners[type]({ target: this, ...event })
  }

  focus () {
    this.focused = true
  }

  scrollIntoView (options) {
    this.scrollIntoViewOptions = options
  }
}

function findById (node, id) {
  if (!node || !node.children) return null
  if (node.id === id) return node
  for (const child of node.children) {
    const match = findById(child, id)
    if (match) return match
  }
  return null
}

function findByClass (node, className) {
  if (!node || !node.children) return []
  const matches = String(node.className || '').split(/\s+/).includes(className) ? [node] : []
  for (const child of node.children) matches.push(...findByClass(child, className))
  return matches
}

function createVisualizer (data) {
  const nodes = new Map()
  for (const id of ['clinic-data', 'deoptigate-files', 'deoptigate-details', 'deoptigate-search', 'deoptigate-severity']) {
    nodes.set(id, new FakeElement('div'))
  }
  nodes.get('clinic-data').textContent = JSON.stringify(data)
  for (const value of ['1', '2', '3']) {
    const button = new FakeElement('button')
    button.dataset.severity = value
    button.setAttribute('aria-pressed', 'true')
    nodes.get('deoptigate-severity').appendChild(button)
  }

  const document = {
    createElement: tagName => new FakeElement(tagName),
    createDocumentFragment: () => new FakeElement('#document-fragment'),
    createTextNode: text => ({ textContent: String(text) }),
    getElementById (id) {
      return nodes.get(id) || findById(nodes.get('deoptigate-details'), id)
    }
  }
  const window = { requestAnimationFrame: callback => callback() }
  const script = fs.readFileSync(path.join(__dirname, '../visualizer/main.js'), 'utf8')
  vm.runInNewContext(script, { document, window })
  return nodes
}

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

test('event categories expose accessible tabs and support arrow-key navigation', (t) => {
  const nodes = createVisualizer(sampleData())
  let tabs = findByClass(nodes.get('deoptigate-details'), 'deoptigate-tab')
  const tablist = findByClass(nodes.get('deoptigate-details'), 'deoptigate-tabs')[0]
  t.equal(tablist.attributes.role, 'tablist', 'groups categories as a tablist')
  t.equal(tabs[1].attributes.role, 'tab', 'exposes each category as a tab')
  t.equal(tabs[1].tabIndex, 0, 'makes the selected tab the keyboard entry point')
  const eventPanel = findById(nodes.get('deoptigate-details'), 'deoptigate-event-panel')
  t.equal(eventPanel.attributes.role, 'tabpanel', 'labels the event content as the tab panel')
  t.equal(eventPanel.attributes['aria-labelledby'], tabs[1].id, 'associates the panel with the selected tab')

  let prevented = false
  tabs[1].dispatch('keydown', { key: 'ArrowRight', preventDefault: () => { prevented = true } })
  tabs = findByClass(nodes.get('deoptigate-details'), 'deoptigate-tab')
  t.ok(prevented, 'prevents the page from scrolling when moving between tabs')
  t.equal(tabs[2].attributes['aria-selected'], 'true', 'moves to the next category with ArrowRight')
  t.equal(tabs[2].focused, true, 'keeps keyboard focus on the newly selected tab')
  t.end()
})

test('repeated event updates collapse and render on demand', (t) => {
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
  t.equal(findByClass(card, 'deoptigate-event-meta').length, 1, 'shows one representative update by default')
  t.equal(history.open, false, 'keeps repeated details collapsed initially')
  t.equal(history.children[0].textContent, 'Show 2 more updates', 'makes the hidden event count clear')

  history.open = true
  history.dispatch('toggle')
  t.equal(findByClass(card, 'deoptigate-event-meta').length, 3, 'loads every update when the user expands the history')
  history.dispatch('toggle')
  t.equal(findByClass(card, 'deoptigate-event-meta').length, 3, 'does not duplicate history when reopened')
  t.end()
})

test('severity filter keeps file list, tabs and event rows in sync', (t) => {
  const nodes = createVisualizer(sampleData())
  const fileList = nodes.get('deoptigate-files')
  const details = nodes.get('deoptigate-details')
  const severityButtons = nodes.get('deoptigate-severity').children
  const selectOnlySeverity = value => {
    for (const button of severityButtons) {
      const shouldBeActive = button.dataset.severity === value
      if ((button.attributes['aria-pressed'] === 'true') !== shouldBeActive) button.dispatch('click')
    }
  }

  t.deepEqual(severityButtons.map(button => button.attributes['aria-pressed']), ['true', 'true', 'true'], 'starts with each severity enabled')
  t.equal(findByClass(fileList, 'deoptigate-file').length, 2, 'shows both files initially')
  t.ok(findByClass(fileList, 'deoptigate-file')[0].attributes['aria-current'] === 'true', 'selects the highest-ranked file shown first')
  t.equal(findByClass(details, 'deoptigate-event').length, 2, 'shows events for the highest-ranked file')

  selectOnlySeverity('3')
  t.deepEqual(severityButtons.map(button => button.attributes['aria-pressed']), ['false', 'false', 'true'], 'allows only high severity to remain enabled')
  t.equal(findByClass(fileList, 'deoptigate-file').length, 1, 'keeps files with severity 3')
  t.equal(findByClass(fileList, 'deoptigate-files-heading')[0].textContent, '1 source file', 'updates the visible file count')
  t.ok(fileList.textContent.includes('high.js'), 'selects the remaining matching file')
  t.equal(findByClass(details, 'deoptigate-event').length, 1, 'shows only the severity 3 deopt')
  t.equal(findByClass(details, 'deoptigate-tab-count')[1].textContent, '1', 'updates tab counts')
  t.ok(findByClass(details, 'deoptigate-muted')[0].textContent.includes('1 deoptimizations'), 'updates the selected file summary')

  selectOnlySeverity('2')
  t.equal(findByClass(details, 'deoptigate-event').length, 1, 'filters to medium severity')

  selectOnlySeverity('1')
  t.equal(findByClass(fileList, 'deoptigate-file').length, 1, 'filters to severity 1 files')
  t.ok(fileList.textContent.includes('low.js'), 'selects the severity 1 file')
  t.equal(findByClass(details, 'deoptigate-event').length, 1, 'shows only severity 1 events')

  severityButtons.find(button => button.dataset.severity === '2').dispatch('click')
  severityButtons.find(button => button.dataset.severity === '3').dispatch('click')
  t.equal(findByClass(fileList, 'deoptigate-file').length, 2, 'restores all files')

  selectOnlySeverity('3')
  nodes.get('deoptigate-search').value = 'low.js'
  nodes.get('deoptigate-search').dispatch('input')
  t.equal(findByClass(fileList, 'deoptigate-file').length, 0, 'allows combining severity and source filters')
  t.ok(findByClass(details, 'deoptigate-empty')[0].textContent.includes('match these filters'), 'explains when filters hide every file')
  findByClass(details, 'deoptigate-clear-filters')[0].dispatch('click')
  t.equal(findByClass(fileList, 'deoptigate-file').length, 2, 'clear filters restores every file')
  t.deepEqual(severityButtons.map(button => button.attributes['aria-pressed']), ['true', 'true', 'true'], 'clear filters enables every severity')
  t.equal(nodes.get('deoptigate-search').value, '', 'clear filters resets source search')
  t.equal(nodes.get('deoptigate-search').focused, true, 'moves focus to the source filter after clearing filters')
  t.end()
})

test('selecting a file opens its most populated event category', (t) => {
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
  let selectedTab = findByClass(details, 'deoptigate-tab').find(tab => tab.attributes['aria-selected'] === 'true')

  t.ok(selectedTab.textContent.startsWith('Inline caches'), 'starts on the category with the most events')
  t.equal(findByClass(details, 'deoptigate-event').length, 2, 'shows the available inline cache events')
  findByClass(nodes.get('deoptigate-files'), 'deoptigate-file')[1].dispatch('click')
  t.equal(findByClass(nodes.get('deoptigate-files'), 'deoptigate-file')[1].focused, true, 'keeps keyboard focus on the selected file after rerendering')
  selectedTab = findByClass(details, 'deoptigate-tab').find(tab => tab.attributes['aria-selected'] === 'true')
  t.ok(selectedTab.textContent.startsWith('Deoptimizations'), 'switches to deoptimizations when the selected file has no inline cache events')
  t.equal(findByClass(details, 'deoptigate-event').length, 1, 'shows the selected file’s deoptimization')
  t.end()
})

test('severity filtering ranks files by the events currently shown', (t) => {
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

  t.ok(findByClass(fileList, 'deoptigate-file')[0].textContent.includes('hidden-high.js'), 'all severities rank the high-impact file first')
  severityButtons.find(button => button.dataset.severity === '2').dispatch('click')
  severityButtons.find(button => button.dataset.severity === '3').dispatch('click')
  t.ok(findByClass(fileList, 'deoptigate-file')[0].textContent.includes('many-low.js'), 'low severity ranks by the low-severity events now visible')
  t.end()
})

test('unresolved source files show a useful recovery hint', (t) => {
  const nodes = createVisualizer([])
  const fileList = nodes.get('deoptigate-files')
  const details = nodes.get('deoptigate-details')

  t.equal(findByClass(fileList, 'deoptigate-files-heading')[0].textContent, '0 source files', 'reports that no source files were resolved')
  t.ok(findByClass(details, 'deoptigate-empty')[0].textContent.includes('No source files were resolved'), 'explains why the details pane is empty')
  t.ok(findByClass(details, 'deoptigate-empty-hint')[0].textContent.includes('project root'), 'suggests checking the profile project root')
  t.end()
})

test('large event lists render in pages and keep every event reachable', (t) => {
  const points = Array.from({ length: 31 }, (_, index) => ({
    line: index + 1,
    functionName: `function${index}`,
    updates: [{ severity: 1, bailoutType: 'eager', deoptReason: 'synthetic event' }]
  }))
  const nodes = createVisualizer([
    ['/app/large.js', { relativePath: 'large.js', deopts: points, ics: [], codes: [], src: 'const large = true' }]
  ])
  const details = nodes.get('deoptigate-details')

  t.equal(findByClass(details, 'deoptigate-event').length, 30, 'renders the first page')
  t.equal(findByClass(details, 'deoptigate-page-status')[0].textContent, 'Showing 1–30 of 31 events', 'shows the current range in a long event list')
  t.equal(findByClass(details, 'deoptigate-page-status')[0].attributes.role, 'status', 'announces page changes to assistive technology')
  const showMore = findByClass(details, 'deoptigate-show-more')[0]
  t.ok(showMore, 'offers a control for the remaining event')
  t.match(showMore.textContent, /Show next 1 event \(1 remaining\)/, 'announces how many events remain')
  showMore.dispatch('click')
  t.equal(findByClass(details, 'deoptigate-event').length, 1, 'moves to the remaining event page')
  t.ok(findByClass(details, 'deoptigate-event-title')[0].textContent.includes('function30'), 'keeps the remaining event visible')
  t.equal(findByClass(details, 'deoptigate-page-status')[0].textContent, 'Showing 31–31 of 31 events', 'updates the visible range on the next page')
  t.equal(findByClass(details, 'deoptigate-show-more')[0].focused, true, 'keeps focus on the page control after moving forward')
  const showPrevious = findByClass(details, 'deoptigate-show-more')[0]
  t.match(showPrevious.textContent, /Show previous 30 events/, 'offers navigation back to earlier events')
  showPrevious.dispatch('click')
  t.equal(findByClass(details, 'deoptigate-event').length, 30, 'returns to the first event page')
  t.equal(findByClass(details, 'deoptigate-page-status')[0].textContent, 'Showing 1–30 of 31 events', 'restores the visible range on the previous page')
  t.equal(findByClass(details, 'deoptigate-show-more')[0].focused, true, 'keeps focus on the page control after moving back')
  t.end()
})

test('source code shows clickable markers at optimization event locations', (t) => {
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

  t.equal(sourcePanel.tabIndex, 0, 'makes the source panel keyboard scrollable')
  t.equal(sourcePanel.attributes['aria-label'], 'Source code for markers.js', 'names the source region for assistive technology')
  t.equal(sourceLines[0].style.height || '19px', '19px', 'keeps lines without markers at the normal line height')
  t.equal(line.style.height || '19px', '19px', 'keeps marker lines on the same source row')
  t.deepEqual(markers.map(marker => marker.textContent), ['▼', '▲'], 'shows deoptimization before optimization at their shared column')
  t.deepEqual(markers.map(marker => marker.dataset.severity), ['3', '2'], 'retains severity on each source marker')
  t.equal(markers.every(marker => findByClass(code, 'deoptigate-source-marker-group')[0].children.includes(marker)), true, 'keeps markers grouped as inline source characters')
  const markerGroup = findByClass(code, 'deoptigate-source-marker-group')[0]
  t.equal(markerGroup.dataset.column, '3', 'anchors the triangle group at its one-based source column')
  t.equal(markerGroup.dataset.column, '3', 'places the inline marker at its one-based source column')
  t.equal(code.children[0].textContent.replace(/[▲▼◆]/g, ''), 'const value = run()', 'keeps source text around inline markers')
  const sourceText = code.textContent.replace(/[▲▼◆]/g, '')
  t.equal(sourceText, 'const value = run()', 'keeps each source character once at a shared marker column')
  markers[1].dispatch('click')
  const optimizationTab = findByClass(details, 'deoptigate-tab').find(button => button.textContent.includes('Optimizations'))
  t.equal(optimizationTab.attributes['aria-selected'], 'true', 'clicking an optimization marker selects its event category')
  t.equal(findByClass(details, 'deoptigate-source-marker').some(marker => marker.focused), true, 'keeps focus on the selected source marker after rerendering')
  const selectedEvent = findByClass(details, 'deoptigate-event')[0]
  t.equal(selectedEvent.dataset.selected, 'true', 'selects the matching event in the list')
  t.equal(selectedEvent.scrollIntoViewOptions.block, 'center', 'scrolls the matching event into view')
  const inlineCacheMarkers = findByClass(findByClass(details, 'deoptigate-source-line')[2], 'deoptigate-source-marker')
  const inlineCacheCode = findByClass(findByClass(details, 'deoptigate-source-line')[2], 'deoptigate-line-text')[0]
  const inlineCacheGroup = findByClass(inlineCacheCode, 'deoptigate-source-marker-group')[0]
  t.equal(inlineCacheMarkers[0].textContent, '◆', 'shows an inline-cache marker at its source location')
  t.equal(inlineCacheMarkers[0].dataset.severity, '1', 'retains inline-cache severity')
  t.equal(inlineCacheGroup.dataset.column, '4', 'places inline-cache markers at their one-based source column')
  inlineCacheMarkers[0].dispatch('click')
  const inlineCacheTab = findByClass(details, 'deoptigate-tab').find(button => button.textContent.includes('Inline caches'))
  t.equal(inlineCacheTab.attributes['aria-selected'], 'true', 'clicking an inline-cache marker selects its event category')
  nodes.get('deoptigate-severity').children.find(button => button.dataset.severity === '1').dispatch('click')
  nodes.get('deoptigate-severity').children.find(button => button.dataset.severity === '2').dispatch('click')
  const highSeverityMarkers = findByClass(findByClass(details, 'deoptigate-source-line')[1], 'deoptigate-source-marker')
  t.deepEqual(highSeverityMarkers.map(marker => marker.textContent), ['▼'], 'severity filtering hides lower-severity source markers')
  t.end()
})

test('source markers preserve their V8 columns and keep source text visible', (t) => {
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

  t.deepEqual(groups.map(group => group.dataset.column), ['3', '12'], 'keeps each marker anchored to its source column')
  t.deepEqual(groups.map(group => group.dataset.column), ['3', '12'], 'keeps inline markers at their V8 source columns')
  t.deepEqual(groups.map(group => group.children[0].textContent), ['▼', '▲'], 'keeps marker buttons associated with their source locations')
  t.equal(code.children[0].textContent.replace(/[▲▼◆]/g, ''), 'const value = run()', 'keeps source text around inline markers')
  t.equal(code.children[0].style.paddingTop || '', '', 'keeps source text on its normal baseline')
  t.equal(code.style.height || '19px', '19px', 'keeps marker lines at the normal line height')
  t.equal(code.textContent.replace(/[▲▼◆]/g, ''), 'const value = run()', 'does not consume or duplicate source characters')
  t.end()
})

test('source markers follow the full token at a one-based V8 column', (t) => {
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

  t.equal(sourceText.children[0].textContent, 'obj.flag', 'keeps the complete property token before the marker')
  t.equal(sourceText.children[1], markerGroup, 'inserts the marker immediately after the property token')
  t.equal(sourceText.children.length, 2, 'does not add an empty text node after the marker')
  t.equal(markerGroup.dataset.column, '5', 'retains the original one-based V8 column')
  t.equal(markerGroup.dataset.characterOffset, '8', 'positions the marker after the complete identifier token')
  t.end()
})

test('source markers stay at the parameter boundary after its opening parenthesis', (t) => {
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

  t.equal(sourceText.children[0].textContent, 'function f(', 'keeps the marker after the opening parenthesis')
  t.equal(sourceText.children[1], markerGroup, 'places the marker before the parameter name')
  t.equal(sourceText.children[2].textContent, 'arg) {}', 'preserves the parameter and following source text')
  t.end()
})

test('script wrapper markers stay before the first source token', (t) => {
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

  t.equal(sourceText.children[0], markerGroup, 'places the script wrapper marker before the first token')
  t.equal(sourceText.children[1].textContent, 'use strict', 'preserves the source after its wrapper marker')
  t.end()
})

test('source markers jump to event pages beyond the first page', (t) => {
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
  const target = eventCards.find(card => card.textContent.includes('function45'))
  const sourcePanel = findById(details, 'deoptigate-source')
  const selectedSourceLine = findByClass(details, 'deoptigate-source-line').find(line => line.attributes['aria-current'] === 'true')
  t.equal(eventCards.length, 30, 'keeps only one event page in the DOM')
  t.ok(target, 'opens the page containing the clicked marker event')
  t.equal(target.dataset.selected, 'true', 'marks the matching event as selected')
  t.equal(target.scrollIntoViewOptions.block, 'center', 'scrolls the off-page event into view')
  t.ok(sourcePanel.scrollTop > 0, 'scrolls the source panel to the clicked marker line')
  t.equal(selectedSourceLine.children[0].textContent, '46', 'renders the clicked marker line as the current source line')
  t.end()
})
