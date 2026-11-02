'use strict'

const fs = require('fs')
const mainCss = fs.readFileSync(require.resolve('../build/deoptigate.css'), 'utf8')
const mainJs = fs.readFileSync(require.resolve('../build/deoptigate.js'), 'utf8')

function createPage(renderData, title = 'deoptigate') {
const render = renderData == null
  ? '<script async src="deoptigate.render-data.js"></script>'
  : `<script>deoptigateRender(${renderData.replace(/[<\u2028\u2029]/g, char => {
    switch (char) {
      case '<': return '\\u003c'
      case '\u2028': return '\\u2028'
      case '\u2029': return '\\u2029'
    }
  })})</script>`
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
