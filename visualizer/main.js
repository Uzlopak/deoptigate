'use strict'

/**
 * @typedef {{severity?: import('../lib/severities').Severity, timestamp?: number, state?: number, oldState?: number, newState?: number, type?: string, key?: string, map?: string, bailoutType?: string, deoptReason?: string, inlined?: boolean}} EventUpdate
 * @typedef {{line?: number, column?: number, functionName?: string, isScript?: boolean, updates?: EventUpdate[]}} EventPoint
 * @typedef {'deopts' | 'ics' | 'codes'} EventCategory
 * @typedef {{relativePath: string, src?: string, deopts: EventPoint[], ics: EventPoint[], codes: EventPoint[]}} FileInfo
 * @typedef {{deopts: EventPoint[], ics: EventPoint[], codes: EventPoint[], score: number}} FileSummary
 * @typedef {{file: string, info: FileInfo, summary: FileSummary}} FileItem
 * @typedef {{category: EventCategory, type: string, symbol: string, label: string, point: EventPoint}} SourceMarker
 */

/** @type {Array<[string, FileInfo]>} */
const data = JSON.parse(/** @type {HTMLElement} */ (document.getElementById('clinic-data')).textContent)
const files = data
  .filter(([, info]) => !/(?:^|[/\\])src[/\\]injects[/\\](?:soft-exit|detect-port)\.js$/.test(info.relativePath))
  .map(([file, info]) => ({ file, info, summary: summarize(info) }))
const optimizationStateNames = /** @type {const} */ (['compiled', 'optimizable', 'optimized'])
const icStateNames = /** @type {const} */ ([
  'uninitialized',
  'premonomorphic',
  'monomorphic',
  'recompute handler',
  'polymorphic',
  'megamorphic',
  'generic'
])
/** @type {WeakMap<FileInfo, string[]>} */
const sourceLinesByInfo = new WeakMap()
const SOURCE_LINE_HEIGHT = 19
const SOURCE_OVERSCAN = 40
const EVENT_PAGE_SIZE = 30
const ALL_SEVERITIES = /** @type {const} */ (['1', '2', '3'])
/** @type {WeakMap<FileInfo, Map<number, SourceMarker[]>>} */
const sourceMarkersByInfo = new WeakMap()
const SOURCE_IDENTIFIER_CHAR_RX = /[A-Za-z0-9_$]/
const SOURCE_PUNCTUATORS = /** @type {const} */ (['>>>=', '===', '!==', '**=', '>>>', '<<=', '>>=', '...', '=>', '++', '--', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&&', '||', '??', '?.', '<<', '>>', '**', '&=', '|=', '^='])
const SOURCE_MARKER_TYPES = /** @type {const} */ ([
  { category: 'deopts', type: 'deoptimization', symbol: '▼', label: 'Deoptimization' },
  { category: 'ics', type: 'inline-cache', symbol: '◆', label: 'Inline cache' },
  { category: 'codes', type: 'optimization', symbol: '▲', label: 'Optimization' }
])

/**
 * @param {readonly string[]} names
 * @param {number | undefined} state
 * @returns {string}
 */
function stateName (names, state) {
  return state == null ? 'unknown' : names[state] || 'unknown'
}

/**
 * @param {number | null | undefined} timestamp
 * @returns {string}
 */
function formatTimestamp (timestamp) {
  return timestamp == null ? '' : `${(timestamp / 1000).toFixed()}ms`
}

/**
 * @param {FileInfo} info
 * @returns {FileSummary}
 */
function summarize (info) {
  const deopts = info.deopts || []
  const ics = info.ics || []
  const codes = info.codes || []
  const score = deopts.concat(ics, codes).reduce((total, point) => {
    const severity = (point.updates || []).reduce((max, update) => Math.max(max, update.severity || 0), 0)
    return total + severity * severity
  }, 0)
  return { deopts, ics, codes, score }
}

/**
 * Create a typed HTML element and optionally set its class and text.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} className
 * @param {string | null} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
function element (tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

/**
 * @param {EventPoint} point
 * @returns {string}
 */
function locationText (point) {
  return `${point.line || 0}:${point.column || 0}`
}

/**
 * @param {EventPoint} point
 * @returns {number}
 */
function severityOf (point) {
  return (point.updates || []).reduce((max, update) => Math.max(max, update.severity || 0), 0)
}

/**
 * @param {FileInfo} info
 * @returns {Map<number, SourceMarker[]>}
 */
function sourceMarkersByLine (info) {
  let markersByLine = sourceMarkersByInfo.get(info)
  if (markersByLine == null) {
    markersByLine = new Map()
    for (const markerType of SOURCE_MARKER_TYPES) {
      for (const point of info[markerType.category] || []) {
        const markerLine = Number(point.line)
        if (!Number.isInteger(markerLine) || markerLine < 1) continue
        if (!markersByLine.has(markerLine)) markersByLine.set(markerLine, [])
        /** @type {SourceMarker} */
        const marker = { ...markerType, point }
        const lineMarkers = markersByLine.get(markerLine)
        if (lineMarkers) lineMarkers.push(marker)
      }
    }
    for (const markers of markersByLine.values()) {
      markers.sort((a, b) => (Number(a.point.column) || 0) - (Number(b.point.column) || 0))
    }
    sourceMarkersByInfo.set(info, markersByLine)
  }

  return markersByLine
}

/**
 * @param {FileInfo} info
 * @param {number} line
 * @returns {SourceMarker[]}
 */
function sourceMarkersForLine (info, line) {
  const markersByLine = sourceMarkersByLine(info)
  return (markersByLine.get(line) || []).filter(marker => matchesSeverity(marker.point))
}

/**
 * @param {string} line
 * @param {number} column
 * @param {number} fallback
 * @returns {number}
 */
function sourceTokenEnd (line, column, fallback) {
  // Match MarkerResolver's behavior: resolve a V8 location at the end of its source token.
  if (!Number.isInteger(column) || column < 1) return fallback
  const offset = Math.min(line.length, column - 1)
  if (offset === line.length) return offset

  if (SOURCE_IDENTIFIER_CHAR_RX.test(line[offset])) {
    let end = offset + 1
    while (end < line.length && SOURCE_IDENTIFIER_CHAR_RX.test(line[end])) end++
    return end
  }

  for (const punctuator of SOURCE_PUNCTUATORS) {
    if (line.startsWith(punctuator, offset)) return offset + punctuator.length
  }
  return offset + 1
}

/**
 * @param {string} line
 * @param {EventPoint} point
 * @param {number} fallback
 * @returns {number}
 */
function markerPositionForPoint (line, point, fallback) {
  if (point.isScript && Number(point.line) === 1 && Number(point.column) === 1) return 0
  return sourceTokenEnd(line, Number(point.column), fallback)
}

/**
 * @param {EventPoint} point
 * @returns {boolean}
 */
function matchesSeverity (point) {
  return selectedSeverities.has(String(severityOf(point)))
}

/**
 * @param {EventPoint[]} points
 * @returns {EventPoint[]}
 */
function matchingPoints (points) {
  return points.filter(matchesSeverity)
}

/**
 * @param {FileInfo} info
 * @returns {EventCategory}
 */
function mostPopulatedTab (info) {
  /** @type {EventCategory} */
  let selected = 'deopts'
  let maximum = 0
  /** @type {EventCategory[]} */
  const categories = ['deopts', 'codes', 'ics']
  for (const category of categories) {
    const count = (info[category] || []).length
    if (count > maximum) {
      selected = category
      maximum = count
    }
  }
  return selected
}

/**
 * @param {FileItem} item
 * @returns {boolean}
 */
function itemMatchesSeverity (item) {
  /** @type {EventCategory[]} */
  const categories = ['deopts', 'ics', 'codes']
  return categories.some(category =>
    item.summary[category].some(matchesSeverity)
  )
}

/**
 * @param {FileItem} item
 * @returns {number}
 */
function visibleScore (item) {
  if (selectedSeverities.size === ALL_SEVERITIES.length) return item.summary.score

  let score = 0
  /** @type {EventCategory[]} */
  const categories = ['deopts', 'ics', 'codes']
  for (const category of categories) {
    for (const point of item.summary[category]) {
      if (matchesSeverity(point)) score += severityOf(point) * severityOf(point)
    }
  }
  return score
}

/** @returns {FileItem[]} */
function visibleFiles () {
  const query = search.value.trim().toLowerCase()
  return files
    .filter(item => item.info.relativePath.toLowerCase().includes(query))
    .filter(item => selectedSeverities.size === ALL_SEVERITIES.length || itemMatchesSeverity(item))
    .sort((a, b) => visibleScore(b) - visibleScore(a))
}

function clearFiltersButton () {
  const button = element('button', 'deoptigate-clear-filters', 'Clear filters')
  button.type = 'button'
  button.addEventListener('click', () => {
    search.value = ''
    selectedSeverities = new Set(ALL_SEVERITIES)
    selectedSourceMarker = null
    eventPageStart = 0
    updateSeverityButtons()
    render()
    search.focus()
  })
  return button
}

const fileList = /** @type {HTMLElement} */ (document.getElementById('deoptigate-files'))
const details = /** @type {HTMLElement} */ (document.getElementById('deoptigate-details'))
const search = /** @type {HTMLInputElement} */ (document.getElementById('deoptigate-search'))
const severityFilter = /** @type {HTMLElement} */ (document.getElementById('deoptigate-severity'))
/** @type {Set<string>} */
let selectedSeverities = new Set(ALL_SEVERITIES)
/** @type {string | null} */
let selectedFile = null
/** @type {HTMLButtonElement | null} */
let selectedFileButton = null
/** @type {EventCategory} */
let selectedTab = 'deopts'
/** @type {number | null} */
let selectedLine = null
/** @type {EventPoint | null} */
let selectedSourceMarker = null
let eventPageStart = 0
/** @type {{ current: HTMLElement | null }} */
const eventCardToScroll = { current: null }
/** @returns {HTMLElement | null} */
function getEventCardToScroll () {
  return eventCardToScroll.current
}
/** @type {HTMLButtonElement | null} */
let previousEventsButton = null
/** @type {HTMLButtonElement | null} */
let nextEventsButton = null
/** @type {HTMLElement | null} */
let sourceElement = null
/** @type {HTMLElement | null} */
let sourceRows = null
/** @type {HTMLElement | null} */
let sourceBefore = null
/** @type {HTMLElement | null} */
let sourceAfter = null
/** @type {string[]} */
let sourceLines = []
/** @type {FileInfo | null} */
let sourceInfo = null
/** @type {HTMLButtonElement | null} */
let selectedMarkerElement = null
let sourceRenderPending = false

/** Render the current filtered source-file list. @returns {void} */
function renderFiles () {
  fileList.replaceChildren()
  selectedFileButton = null
  const filteredFiles = visibleFiles()
  const fileNoun = filteredFiles.length === 1 ? 'file' : 'files'
  const heading = element('div', 'deoptigate-files-heading', `${filteredFiles.length} source ${fileNoun}`)
  fileList.appendChild(heading)

  if (!filteredFiles.some(item => item.file === selectedFile)) {
    selectedFile = filteredFiles.length ? filteredFiles[0].file : null
    selectedLine = null
  }

  const selectedItem = filteredFiles.find(item => item.file === selectedFile)
  if (selectedItem && !(selectedItem.info[selectedTab] || []).length) {
    selectedTab = mostPopulatedTab(selectedItem.info)
  }

  for (const item of filteredFiles) {
    const button = element('button', 'deoptigate-file')
    button.type = 'button'
    button.setAttribute('aria-current', String(item.file === selectedFile))
    if (item.file === selectedFile) selectedFileButton = button
    const name = element('span', 'deoptigate-file-name', item.info.relativePath)
    const counts = element('span', 'deoptigate-file-counts',
      `${matchingPoints(item.summary.deopts).length} deopts · ${matchingPoints(item.summary.ics).length} ICs · ${matchingPoints(item.summary.codes).length} optimizations`)
    button.append(name, counts)
    button.addEventListener('click', () => {
      selectedFile = item.file
      selectedLine = null
      selectedSourceMarker = null
      eventPageStart = 0
      render()
      if (selectedFileButton && typeof selectedFileButton.focus === 'function') selectedFileButton.focus()
    })
    fileList.appendChild(button)
  }
}

/**
 * @param {EventCategory} tab
 * @param {EventUpdate} update
 * @returns {Array<string | undefined | null | false>}
 */
function eventDescription (tab, update) {
  if (tab === 'deopts') {
    return [update.bailoutType, update.deoptReason, update.inlined ? 'inlined' : 'not inlined']
  }
  if (tab === 'ics') {
    const oldState = stateName(icStateNames, update.oldState)
    const newState = stateName(icStateNames, update.newState)
    return [update.type, `${oldState} → ${newState}`, update.key, update.map && `map ${update.map}`]
  }
  return [stateName(optimizationStateNames, update.state)]
}

/**
 * @param {EventCategory} tab
 * @param {EventUpdate} update
 * @returns {HTMLElement}
 */
function eventMeta (tab, update) {
  const meta = element('div', 'deoptigate-event-meta')
  const timestamp = formatTimestamp(update.timestamp)
  if (timestamp) meta.appendChild(element('span', '', timestamp))
  for (const value of eventDescription(tab, update)) {
    if (value != null && value !== '') meta.appendChild(element('span', '', String(value)))
  }
  return meta
}

/**
 * @param {FileInfo} info
 * @returns {EventPoint[]}
 */
function pointsForTab (info) {
  return info[selectedTab] || []
}

/**
 * @param {FileInfo} info
 * @param {HTMLElement} events
 * @returns {void}
 */
function renderTabs (info, events) {
  /** @type {Array<[EventCategory, string]>} */
  const tabs = [
    ['codes', 'Optimizations'],
    ['deopts', 'Deoptimizations'],
    ['ics', 'Inline caches']
  ]
  const nav = element('div', 'deoptigate-tabs')
  nav.setAttribute('role', 'tablist')
  nav.setAttribute('aria-label', 'Event categories')
  for (const [key, label] of tabs) {
    const button = element('button', 'deoptigate-tab')
    button.type = 'button'
    button.id = `deoptigate-tab-${key}`
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-selected', String(selectedTab === key))
    button.setAttribute('aria-controls', 'deoptigate-event-panel')
    button.tabIndex = selectedTab === key ? 0 : -1
    button.append(document.createTextNode(label))
    const count = element('span', 'deoptigate-tab-count', String(matchingPoints(info[key] || []).length))
    button.appendChild(count)
    const selectTab = () => {
      selectedTab = key
      selectedSourceMarker = null
      eventPageStart = 0
      render()
      const selectedButton = document.getElementById(`deoptigate-tab-${key}`)
      if (selectedButton && typeof selectedButton.focus === 'function') selectedButton.focus()
    }
    button.addEventListener('click', selectTab)
    button.addEventListener('keydown', event => {
      const currentIndex = tabs.findIndex(([tabKey]) => tabKey === key)
      /** @type {number} */
      let nextIndex
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex + tabs.length - 1) % tabs.length
      else if (event.key === 'Home') nextIndex = 0
      else if (event.key === 'End') nextIndex = tabs.length - 1
      else return
      event.preventDefault()
      selectedTab = tabs[nextIndex][0]
      selectedSourceMarker = null
      eventPageStart = 0
      render()
      const selectedButton = document.getElementById(`deoptigate-tab-${selectedTab}`)
      if (selectedButton && typeof selectedButton.focus === 'function') selectedButton.focus()
    })
    nav.appendChild(button)
  }
  events.appendChild(nav)
}

/**
 * @param {FileInfo} info
 * @param {HTMLElement} events
 * @returns {void}
 */
function renderEvents (info, events) {
  eventCardToScroll.current = null
  previousEventsButton = null
  nextEventsButton = null
  const list = element('div', 'deoptigate-events-list')
  list.id = 'deoptigate-event-panel'
  list.setAttribute('role', 'tabpanel')
  list.setAttribute('aria-labelledby', `deoptigate-tab-${selectedTab}`)
  list.setAttribute('tabindex', '0')
  const allPoints = pointsForTab(info)
  const points = matchingPoints(allPoints)
  if (points.length === 0) {
    const message = allPoints.length
      ? 'No events match this severity filter.'
      : 'No events in this category.'
    list.appendChild(element('div', 'deoptigate-empty', message))
  }

  /**
   * @param {EventPoint} point
   * @returns {HTMLElement}
   */
  const renderEvent = point => {
    const card = element('article', 'deoptigate-event')
    card.dataset.severity = String(severityOf(point))
    card.dataset.selected = String(point === selectedSourceMarker)
    const heading = element('div', 'deoptigate-event-heading')
    heading.appendChild(element('span', 'deoptigate-event-title', point.functionName || '(anonymous)'))
    const location = element('button', 'deoptigate-event-location', locationText(point))
    location.type = 'button'
    location.setAttribute('aria-label', `Show source at ${locationText(point)}`)
    location.addEventListener('click', () => {
      selectedSourceMarker = point
      selectedLine = point.line || 1
      render()
      if (selectedMarkerElement && typeof selectedMarkerElement.focus === 'function') selectedMarkerElement.focus()
    })
    heading.appendChild(location)
    card.appendChild(heading)

    const updates = point.updates || []
    if (updates.length) card.appendChild(eventMeta(selectedTab, updates[0]))
    if (updates.length > 1) {
      const history = element('details', 'deoptigate-event-history')
      const remaining = updates.length - 1
      const noun = remaining === 1 ? 'update' : 'updates'
      history.appendChild(element('summary', 'deoptigate-event-history-toggle', `Show ${remaining} more ${noun}`))
      let historyRendered = false
      history.addEventListener('toggle', () => {
        if (!history.open || historyRendered) return
        for (const update of updates.slice(1)) history.appendChild(eventMeta(selectedTab, update))
        historyRendered = true
      })
      card.appendChild(history)
    }
    if (point === selectedSourceMarker) eventCardToScroll.current = card
    return card
  }

  const selectedIndex = selectedSourceMarker == null ? -1 : points.indexOf(selectedSourceMarker)
  if (selectedIndex !== -1) {
    eventPageStart = Math.floor(selectedIndex / EVENT_PAGE_SIZE) * EVENT_PAGE_SIZE
  } else {
    const lastPageStart = Math.floor(Math.max(0, points.length - 1) / EVENT_PAGE_SIZE) * EVENT_PAGE_SIZE
    eventPageStart = Math.min(eventPageStart, lastPageStart)
  }

  if (points.length > EVENT_PAGE_SIZE) {
    const firstEvent = eventPageStart + 1
    const lastEvent = Math.min(eventPageStart + EVENT_PAGE_SIZE, points.length)
    const pageStatus = element('div', 'deoptigate-page-status', `Showing ${firstEvent}–${lastEvent} of ${points.length} events`)
    pageStatus.setAttribute('role', 'status')
    list.appendChild(pageStatus)
  }

  const end = Math.min(eventPageStart + EVENT_PAGE_SIZE, points.length)
  if (eventPageStart > 0) {
    const previousCount = Math.min(EVENT_PAGE_SIZE, eventPageStart)
    const previous = element('button', 'deoptigate-show-more', `Show previous ${previousCount} events`)
    previous.type = 'button'
    previous.addEventListener('click', () => {
      eventPageStart = Math.max(0, eventPageStart - EVENT_PAGE_SIZE)
      selectedSourceMarker = null
      render()
      const focusTarget = previousEventsButton || nextEventsButton
      if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus()
    })
    previousEventsButton = previous
    list.appendChild(previous)
  }

  for (let index = eventPageStart; index < end; index++) {
    list.appendChild(renderEvent(points[index]))
  }

  if (end < points.length) {
    const nextPageSize = Math.min(EVENT_PAGE_SIZE, points.length - end)
    const noun = nextPageSize === 1 ? 'event' : 'events'
    const next = element('button', 'deoptigate-show-more', `Show next ${nextPageSize} ${noun} (${points.length - end} remaining)`)
    next.type = 'button'
    next.addEventListener('click', () => {
      eventPageStart = end
      selectedSourceMarker = null
      render()
      const focusTarget = nextEventsButton || previousEventsButton
      if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus()
    })
    nextEventsButton = next
    list.appendChild(next)
  }
  events.appendChild(list)
}

/** Render the currently visible source lines and their markers. @returns {void} */
function renderVisibleSourceLines () {
  if (sourceElement == null || sourceRows == null || sourceBefore == null || sourceAfter == null || sourceInfo == null) return
  selectedMarkerElement = null
  const firstVisible = Math.floor(sourceElement.scrollTop / SOURCE_LINE_HEIGHT)
  const start = Math.max(0, firstVisible - SOURCE_OVERSCAN)
  const visibleRows = Math.ceil(sourceElement.clientHeight / SOURCE_LINE_HEIGHT) + SOURCE_OVERSCAN * 2
  const end = Math.min(sourceLines.length, start + visibleRows)
  sourceBefore.style.height = `${start * SOURCE_LINE_HEIGHT}px`
  sourceAfter.style.height = `${(sourceLines.length - end) * SOURCE_LINE_HEIGHT}px`

  const rows = document.createDocumentFragment()
  for (let index = start; index < end; index++) {
    const line = index + 1
    const row = element('div', 'deoptigate-source-line')
    row.setAttribute('aria-current', String(line === selectedLine))
    const markers = sourceMarkersForLine(sourceInfo, line)
    const lineNumber = element('span', 'deoptigate-line-number', String(line))
    row.appendChild(lineNumber)
    const lineText = sourceLines[index] || ' '
    const code = element('span', 'deoptigate-line-text')
    const sourceText = element('span', 'deoptigate-source-text')
    code.appendChild(sourceText)
    let cursor = 0
    for (let markerIndex = 0; markerIndex < markers.length;) {
      const marker = markers[markerIndex]
      const column = Number(marker.point.column)
      const markerPosition = markerPositionForPoint(lineText, marker.point, cursor)
      const position = Math.max(cursor, markerPosition)

      if (position > cursor) sourceText.appendChild(document.createTextNode(lineText.slice(cursor, position)))
      const group = element('span', 'deoptigate-source-marker-group')
      group.dataset.column = String(Number.isInteger(column) && column > 0 ? column : position + 1)
      group.dataset.characterOffset = String(position)
      /** @type {HTMLButtonElement[]} */
      const groupButtons = []
      while (markerIndex < markers.length) {
        const currentMarker = markers[markerIndex]
        const currentColumn = Number(currentMarker.point.column)
        const currentPosition = markerPositionForPoint(lineText, currentMarker.point, cursor)
        if (Math.max(cursor, currentPosition) !== position) break

        const severity = severityOf(currentMarker.point)
        const selected = selectedSourceMarker === currentMarker.point ? ' selected' : ''
        const button = element('button', `deoptigate-source-marker deoptigate-marker-${currentMarker.type} deoptigate-marker-severity-${severity}${selected}`, currentMarker.symbol)
        button.type = 'button'
        if (selectedSourceMarker === currentMarker.point) selectedMarkerElement = button
        button.dataset.markerType = currentMarker.type
        button.dataset.severity = String(severity)
        button.setAttribute('aria-label', `${currentMarker.label} at line ${line}, column ${currentColumn || 0}`)
        button.title = `${currentMarker.label} at ${line}:${currentColumn || 0}`
        button.addEventListener('click', () => {
          selectedSourceMarker = currentMarker.point
          selectedTab = currentMarker.category
          selectedLine = line
          render()
          if (selectedMarkerElement && typeof selectedMarkerElement.focus === 'function') selectedMarkerElement.focus()
        })
        group.appendChild(button)
        groupButtons.push(button)
        markerIndex++
      }
      sourceText.appendChild(group)
      cursor = position
    }
    if (cursor < lineText.length || markers.length === 0) {
      sourceText.appendChild(document.createTextNode(lineText.slice(cursor)))
    }
    row.appendChild(code)
    rows.appendChild(row)
  }
  sourceRows.replaceChildren(rows)
}

/** Scroll the selected marker into view when it is horizontally clipped. @returns {void} */
function revealSelectedSourceMarker () {
  if (selectedMarkerElement == null || sourceElement == null) return

  const sourceRect = sourceElement.getBoundingClientRect()
  const markerRect = selectedMarkerElement.getBoundingClientRect()
  const visibleLeft = sourceRect.left + sourceElement.clientLeft
  const visibleRight = visibleLeft + sourceElement.clientWidth
  const margin = 12

  if (markerRect.left < visibleLeft + margin) {
    sourceElement.scrollLeft -= visibleLeft + margin - markerRect.left
  } else if (markerRect.right > visibleRight - margin) {
    sourceElement.scrollLeft += markerRect.right - visibleRight + margin
  }
}

/** Schedule a source viewport render on the next animation frame. @returns {void} */
function scheduleSourceRender () {
  if (sourceRenderPending) return
  sourceRenderPending = true
  window.requestAnimationFrame(() => {
    sourceRenderPending = false
    renderVisibleSourceLines()
  })
}

/**
 * @param {FileInfo} info
 * @param {number | null} lineToScroll
 * @returns {void}
 */
function renderSource (info, lineToScroll) {
  const source = /** @type {HTMLElement} */ (document.getElementById('deoptigate-source'))
  if (sourceElement !== source || sourceInfo !== info) {
    sourceElement = source
    sourceInfo = info
    const cachedSourceLines = sourceLinesByInfo.get(info)
    sourceLines = cachedSourceLines || (info.src || '').split('\n')
    if (cachedSourceLines == null) sourceLinesByInfo.set(info, sourceLines)
    sourceBefore = element('div', 'deoptigate-source-spacer')
    sourceRows = element('div', 'deoptigate-source-lines')
    sourceAfter = element('div', 'deoptigate-source-spacer')
    source.replaceChildren(sourceBefore, sourceRows, sourceAfter)
    source.addEventListener('scroll', scheduleSourceRender, { passive: true })
    source.scrollTop = 0
    source.scrollLeft = 0
  }

  renderVisibleSourceLines()
  if (lineToScroll != null) {
    source.scrollTop = Math.max(0, (lineToScroll - 1) * SOURCE_LINE_HEIGHT - source.clientHeight / 3)
    renderVisibleSourceLines()
  }
  revealSelectedSourceMarker()
}

/** Render the file list, events, and selected source. @returns {void} */
function render () {
  eventCardToScroll.current = null
  renderFiles()
  details.replaceChildren()
  const item = files.find(({ file }) => file === selectedFile)
  if (!item) {
    const message = files.length
      ? 'No source files match these filters.'
      : 'No source files were resolved from this V8 log.'
    const empty = element('div', 'deoptigate-empty', message)
    if (files.length) empty.appendChild(clearFiltersButton())
    else empty.appendChild(element('p', 'deoptigate-empty-hint', 'Check that the project root used for this profile still contains the source files.'))
    details.appendChild(empty)
    return
  }

  const info = item.info
  const events = element('section', 'deoptigate-events')
  const summary = item.summary
  const codeCount = matchingPoints(summary.codes).length
  const deoptCount = matchingPoints(summary.deopts).length
  const icCount = matchingPoints(summary.ics).length
  events.appendChild(element('h2', 'deoptigate-file-title', info.relativePath))
  events.appendChild(element('div', 'deoptigate-muted',
    `${codeCount} optimizations · ${deoptCount} deoptimizations · ${icCount} inline cache records`))
  renderTabs(info, events)
  renderEvents(info, events)

  const source = element('section', 'deoptigate-source')
  source.id = 'deoptigate-source'
  source.tabIndex = 0
  source.setAttribute('aria-label', `Source code for ${info.relativePath}`)
  details.append(events, source)
  renderSource(info, selectedLine)
  const cardToScroll = getEventCardToScroll()
  if (cardToScroll) {
    cardToScroll.scrollIntoView({ block: 'center' })
  }
  eventCardToScroll.current = null
}

search.addEventListener('input', () => {
  selectedSourceMarker = null
  eventPageStart = 0
  render()
})
function updateSeverityButtons () {
  for (const child of severityFilter.children) {
    const button = /** @type {HTMLElement} */ (child)
    button.setAttribute('aria-pressed', String(selectedSeverities.has(button.dataset.severity || '')))
  }
}

for (const child of severityFilter.children) {
  const button = /** @type {HTMLElement} */ (child)
  button.addEventListener('click', () => {
    const severity = button.dataset.severity || ''
    if (selectedSeverities.has(severity)) selectedSeverities.delete(severity)
    else selectedSeverities.add(severity)
    selectedSourceMarker = null
    eventPageStart = 0
    updateSeverityButtons()
    render()
  })
}
render()
