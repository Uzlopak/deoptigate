'use strict'

const test = require('node:test')

const { placeholder, renderHighlighted } = require('../app/lib/render-highlighted')

test('text that never reached a renderer is escaped', (/** @type {import('node:test').TestContext} */ t) => {
  const html = renderHighlighted('<img src=x onerror=alert(1)>', [])
  t.assert.ok(!html.includes('<img'))
  t.assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
})

test('rendered fragments are inserted as markup', (/** @type {import('node:test').TestContext} */ t) => {
  const html = renderHighlighted(`${placeholder(1)} ${placeholder(0)}`, ['<b>first</b>', '<i>second</i>'])
  t.assert.ok(html.includes('<i>second</i> <b>first</b>'))
})

test('the highlighted code keeps its page structure', (/** @type {import('node:test').TestContext} */ t) => {
  t.assert.equal(renderHighlighted(placeholder(0), ['<b>a</b>']), [
    '<div class="highlight"><pre>',
    '<table>',
    '<td>',
    '<span class="lineno">1</span>',
    '</td>',
    '<td>',
    '<b>a</b>',
    '</td>',
    '</table>',
    '</pre></div>'
  ].join('\n'))
})

test('line numbers include lines inside a fragment', (/** @type {import('node:test').TestContext} */ t) => {
  const html = renderHighlighted(`${placeholder(0)}\nrun`, ['<b>/*\n*/</b>'])
  t.assert.equal(html.match(/class="lineno"/g)?.length, 3)
})

test('line numbers are padded to the width of the last line', (/** @type {import('node:test').TestContext} */ t) => {
  const html = renderHighlighted('\n'.repeat(9), [])
  t.assert.ok(html.includes('<span class="lineno"> 1</span>'))
  t.assert.ok(html.includes('<span class="lineno">10</span>'))
})

test('a placeholder written in the source cannot select an unknown fragment', (/** @type {import('node:test').TestContext} */ t) => {
  const html = renderHighlighted(`${placeholder(9)}<b>`, [])
  t.assert.ok(html.includes(`${placeholder(9)}&lt;b&gt;`))
})

test('a fragment is not searched for further placeholders', (/** @type {import('node:test').TestContext} */ t) => {
  const html = renderHighlighted(placeholder(0), [placeholder(1), '<img>'])
  t.assert.ok(!html.includes('<img>'))
})
