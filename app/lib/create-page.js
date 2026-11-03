'use strict'

const fs = require('fs')
const mainCss = fs.readFileSync(require.resolve('../build/deoptigate.css'), 'utf8')
const mainJs = fs.readFileSync(require.resolve('../build/deoptigate.js'), 'utf8')
/** @type {Record<string, string>} */
const SCRIPT_DATA_ESCAPES = {
  '<': '\\u003c',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029'
}

/**
 * Build the standalone report page, embedding render data when provided.
 * @param {string | null | undefined} renderData Serialized report data.
 * @param {string} [title='deoptigate'] Page title.
 * @returns {string} Complete HTML document.
 */
function createPage(renderData, title = 'deoptigate') {
const render = renderData == null
  ? '<script async src="deoptigate.render-data.js"></script>'
  : `<script>deoptigateRender(${renderData.replace(/[<\u2028\u2029]/g, char => SCRIPT_DATA_ESCAPES[char])})</script>`
return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>${title}</title>
    <style async type="text/css" media="screen">
      ${mainCss}
    </style>
    <script async type="text/javascript" charset="utf-8">
      ${mainJs}
    </script>
  </head>
  <body>
    ${render}
  </body>
</html>
`
}

module.exports = createPage
