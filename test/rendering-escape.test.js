'use strict'

const { test } = require('node:test')
const markOnly = require('../lib/rendering/mark-only')
const escapeHtml = require('../lib/rendering/escape-html')

/**
 * @param {Array<{id: string, line: number, column: number}>} markers
 * @returns {{nextLocation: () => {line: number, column: number} | null, resolve: () => {insertBefore: string, insertAfter: string}}}
 */
function resolverFor(markers) {
  let idx = 0
  return {
    nextLocation() {
      return markers[idx] || null
    },
    resolve() {
      const marker = markers[idx++]
      return {
        insertBefore: `<a data-marker="${marker.id}">`,
        insertAfter: '</a>'
      }
    }
  }
}

test('markOnly escapes source text and leaves generated markers as HTML', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  let calls = 0
  const markerResolver = {
    nextLocation() {
      calls++
      return calls === 1 ? { line: 1, column: 1 } : null
    },
    resolve() {
      return { insertBefore: '<a class="marker">', insertAfter: '</a>' }
    }
  }

  const html = markOnly('<img src=x onerror="alert(1)"> &', markerResolver)
  t.assert.ok(html.includes('<a class="marker">&lt;</a>'), 'trusted marker markup remains active')
  t.assert.ok(html.includes('>img src=x onerror=&quot;alert(1)&quot;&gt;'), 'source text after the marked character is escaped')
  t.assert.ok(html.includes('&amp;'), 'ampersands in source are escaped')
  t.assert.ok(!html.includes('<img'), 'source cannot create an image element')
})

test('escapeHtml makes raw fallback source safe for HTML', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const source = '<svg onload="alert(1)">'
  const html = `<pre>${escapeHtml(source)}</pre>`

  t.assert.ok(html.includes('&lt;svg onload=&quot;alert(1)&quot;&gt;'), 'fallback escapes source markup')
  t.assert.ok(!html.includes('<svg'), 'fallback does not emit a source SVG element')
})

test('markOnly renders unmarked full lines', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const html = markOnly('alpha\nbeta', resolverFor([]))
  t.assert.equal(
    html,
    `<div class="pre"'><span>1: </span><span>alpha</span><br><span>2: </span><span>beta</span><br></div>`,
    'preserves full source lines when there are no markers'
  )
})

test('markOnly inserts a marker at the final source column', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const html = markOnly('end', resolverFor([
    { id: 'last', line: 1, column: 3 }
  ]))
  t.assert.ok(html.includes('en<a data-marker="last">d</a>'), 'marks and retains the last character')
})

test('markOnly does not duplicate a source character for markers at the same column', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const html = markOnly('ab', resolverFor([
    { id: 'first', line: 1, column: 1 },
    { id: 'second', line: 1, column: 1 }
  ]))
  t.assert.ok(
    html.includes('<a data-marker="first">a</a><a data-marker="second"></a>b'),
    'adds both markers while writing the source character once'
  )
})

test('markOnly carries a future-line marker forward', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const html = markOnly('first\nsecond', resolverFor([
    { id: 'future', line: 2, column: 2 }
  ]))
  t.assert.ok(html.includes('<span>1: </span><span>first</span><br>'), 'leaves earlier lines untouched')
  t.assert.ok(html.includes('<span>2: </span><span>s<a data-marker="future">e</a>cond</span><br>'), 'marks the future line')
})

test('markOnly carries the next adjacent line marker out of the current line', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const html = markOnly('first\nsecond', resolverFor([
    { id: 'first-line', line: 1, column: 1 },
    { id: 'second-line', line: 2, column: 1 }
  ]))
  t.assert.ok(html.includes('<a data-marker="first-line">f</a>irst'), 'renders the first line marker')
  t.assert.ok(html.includes('<a data-marker="second-line">s</a>econd'), 'continues with the adjacent line marker')
})
