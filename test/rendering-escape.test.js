'use strict'

const test = require('tape')
const markOnly = require('../lib/rendering/mark-only')
const escapeHtml = require('../lib/rendering/escape-html')

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

test('markOnly escapes source text and leaves generated markers as HTML', (t) => {
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
  t.ok(html.includes('<a class="marker">&lt;</a>'), 'trusted marker markup remains active')
  t.ok(html.includes('>img src=x onerror=&quot;alert(1)&quot;&gt;'), 'source text after the marked character is escaped')
  t.ok(html.includes('&amp;'), 'ampersands in source are escaped')
  t.notOk(html.includes('<img'), 'source cannot create an image element')
  t.end()
})

test('escapeHtml makes raw fallback source safe for HTML', (t) => {
  const source = '<svg onload="alert(1)">'
  const html = `<pre>${escapeHtml(source)}</pre>`

  t.ok(html.includes('&lt;svg onload=&quot;alert(1)&quot;&gt;'), 'fallback escapes source markup')
  t.notOk(html.includes('<svg'), 'fallback does not emit a source SVG element')
  t.end()
})

test('markOnly renders unmarked full lines', (t) => {
  const html = markOnly('alpha\nbeta', resolverFor([]))
  t.equal(
    html,
    `<div class="pre"'><span>1: </span><span>alpha</span><br><span>2: </span><span>beta</span><br></div>`,
    'preserves full source lines when there are no markers'
  )
  t.end()
})

test('markOnly inserts a marker at the final source column', (t) => {
  const html = markOnly('end', resolverFor([
    { id: 'last', line: 1, column: 3 }
  ]))
  t.ok(html.includes('en<a data-marker="last">d</a>'), 'marks and retains the last character')
  t.end()
})

test('markOnly does not duplicate a source character for markers at the same column', (t) => {
  const html = markOnly('ab', resolverFor([
    { id: 'first', line: 1, column: 1 },
    { id: 'second', line: 1, column: 1 }
  ]))
  t.ok(
    html.includes('<a data-marker="first">a</a><a data-marker="second"></a>b'),
    'adds both markers while writing the source character once'
  )
  t.end()
})

test('markOnly carries a future-line marker forward', (t) => {
  const html = markOnly('first\nsecond', resolverFor([
    { id: 'future', line: 2, column: 2 }
  ]))
  t.ok(html.includes('<span>1: </span><span>first</span><br>'), 'leaves earlier lines untouched')
  t.ok(html.includes('<span>2: </span><span>s<a data-marker="future">e</a>cond</span><br>'), 'marks the future line')
  t.end()
})
