'use strict'

const { test } = require('node:test')
const createPage = require('../app/lib/create-page')

test('createPage escapes data that could break the inline script', function (/** @type {import('node:test').TestContext} */ t) {
  t.plan(3)
  const renderData = JSON.stringify({
    closingScript: '</script>',
    lineSeparator: '\u2028',
    paragraphSeparator: '\u2029'
  })
  const html = createPage(renderData, 'safe data')

  t.assert.ok(html.includes('\\u003c/script>'), 'escapes less-than characters')
  t.assert.ok(html.includes('\\u2028'), 'escapes line separators')
  t.assert.ok(html.includes('\\u2029'), 'escapes paragraph separators')
})

test('createPage uses the external render-data script when data is absent', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const html = createPage(undefined)
  t.assert.ok(html.includes('src="deoptigate.render-data.js"'), 'loads a separate render-data file')
  t.assert.ok(html.includes('<title>deoptigate</title>'), 'uses the default title')
})

test('createPage escapes caller-supplied titles', (
  /** @type {import('node:test').TestContext} */ t
) => {
  const title = '</title><script>globalThis.pwned = true</script>'
  const html = createPage(undefined, title)

  t.assert.ok(
    html.includes('<title>&lt;/title&gt;&lt;script&gt;globalThis.pwned = true&lt;/script&gt;</title>'),
    'keeps title markup as text'
  )
  t.assert.ok(!html.includes(`<title>${title}</title>`), 'does not inject markup into the document head')
})
