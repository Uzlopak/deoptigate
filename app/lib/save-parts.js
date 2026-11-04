'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

const tmpdir = os.tmpdir()
const deoptigateDir = path.join(tmpdir, 'deoptigate')

/**
 * Save the report HTML to the temporary Deoptigate report directory.
 * @param {string} html Complete HTML document.
 * @returns {string} Path to the saved page.
 */
function savePage(html) {
  fs.mkdirSync(deoptigateDir, { recursive: true, mode: 0o700 })
  fs.chmodSync(deoptigateDir, 0o700)
  const dest = path.join(deoptigateDir, 'index.html')
  fs.writeFileSync(dest, html, { encoding: 'utf8', mode: 0o600 })
  fs.chmodSync(dest, 0o600)
  return dest
}

/**
 * Save serialized render data as a script that invokes the report renderer.
 * @param {string} json Serialized report data.
 * @returns {string} Path to the saved render-data script.
 */
function saveEntry(json) {
  fs.mkdirSync(deoptigateDir, { recursive: true, mode: 0o700 })
  fs.chmodSync(deoptigateDir, 0o700)
  const entryDest = path.join(deoptigateDir, 'deoptigate.render-data.js')
  const entryJS = `
  (function () {
    const info = ${json}
    return deoptigateRender(info)
  })()
  `

  fs.writeFileSync(entryDest, entryJS, { encoding: 'utf8', mode: 0o600 })
  fs.chmodSync(entryDest, 0o600)
  return entryDest
}

/**
 * Save serialized report data as a standalone JSON file.
 * @param {string} json Serialized report data.
 * @param {'json' | 'compact_json' | 'jsonl'} [format='json'] JSON format.
 * @returns {string} Path to the saved JSON file.
 */
function saveJson(json, format = 'json') {
  fs.mkdirSync(deoptigateDir, { recursive: true, mode: 0o700 })
  fs.chmodSync(deoptigateDir, 0o700)
  const filename = format === 'compact_json'
    ? 'deoptigate.compact.json'
    : format === 'jsonl'
      ? 'deoptigate.jsonl'
      : 'deoptigate.json'
  const dest = path.join(deoptigateDir, filename)
  fs.writeFileSync(dest, json, { encoding: 'utf8', mode: 0o600 })
  fs.chmodSync(dest, 0o600)
  return dest
}

module.exports = { savePage, saveEntry, saveJson }
