'use strict'

const test = require('tape')
const createPage = require('../app/lib/create-page')

test('createPage escapes data that could break the inline script', function (t) {
  const renderData = JSON.stringify({
    closingScript: '</script>',
    lineSeparator: '\u2028',
    paragraphSeparator: '\u2029'
  })
  const html = createPage(renderData, 'safe data')

  t.ok(html.includes('\\u003c/script>'), 'escapes less-than characters')
  t.ok(html.includes('\\u2028'), 'escapes line separators')
  t.ok(html.includes('\\u2029'), 'escapes paragraph separators')
  t.end()
})
