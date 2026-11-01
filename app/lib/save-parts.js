'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

const tmpdir = os.tmpdir()
const deoptigateDir = path.join(tmpdir, 'deoptigate')

function savePage(html) {
  fs.mkdirSync(deoptigateDir, { recursive: true })
  const dest = path.join(deoptigateDir, 'index.html')
  fs.writeFileSync(dest, html, 'utf8')
  return dest
}

function saveEntry(json) {
  fs.mkdirSync(deoptigateDir, { recursive: true })
  const entryDest = path.join(deoptigateDir, 'deoptigate.render-data.js')
  const entryJS = `
  (function () {
    const info = ${json}
    return deoptigateRender(info)
  })()
  `

  fs.writeFileSync(entryDest, entryJS, 'utf8')
}

module.exports = { savePage, saveEntry }
