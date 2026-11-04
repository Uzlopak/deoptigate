'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('node:test')

const savePartsPath = require.resolve('../app/lib/save-parts')

test('saved reports are private to the current user', (
  /** @type {import('node:test').TestContext} */ t
) => {
  const originalTmpdir = os.tmpdir
  const tempRoot = fs.mkdtempSync(path.join(originalTmpdir(), 'deoptigate-private-report-'))
  os.tmpdir = () => tempRoot
  delete require.cache[savePartsPath]

  try {
    const { savePage, saveEntry, saveJson } = require(savePartsPath)
    const pagePath = savePage('<html></html>')
    saveEntry('{"files":[]}')
    const jsonPath = saveJson('{"files":[]}')
    const compactJsonPath = saveJson('{"v":1,"files":[]}', 'compact_json')
    const jsonlPath = saveJson('{"file":"app.js"}', 'jsonl')
    const entryPath = path.join(tempRoot, 'deoptigate', 'deoptigate.render-data.js')
    const directoryMode = fs.statSync(path.dirname(pagePath)).mode & 0o777
    const pageMode = fs.statSync(pagePath).mode & 0o777
    const entryMode = fs.statSync(entryPath).mode & 0o777
    const jsonMode = fs.statSync(jsonPath).mode & 0o777
    const compactJsonMode = fs.statSync(compactJsonPath).mode & 0o777
    const jsonlMode = fs.statSync(jsonlPath).mode & 0o777

    t.assert.equal(directoryMode & 0o077, 0, 'does not expose the report directory to other users')
    t.assert.equal(pageMode & 0o077, 0, 'does not expose the HTML report to other users')
    t.assert.equal(entryMode & 0o077, 0, 'does not expose embedded source data to other users')
    t.assert.equal(fs.readFileSync(jsonPath, 'utf8'), '{"files":[]}', 'writes the standalone JSON data')
    t.assert.equal(jsonMode & 0o077, 0, 'does not expose the JSON report to other users')
    t.assert.match(compactJsonPath, /deoptigate\.compact\.json$/, 'uses a distinct compact JSON filename')
    t.assert.equal(fs.readFileSync(compactJsonPath, 'utf8'), '{"v":1,"files":[]}', 'writes compact JSON data')
    t.assert.equal(compactJsonMode & 0o077, 0, 'does not expose the compact JSON report to other users')
    t.assert.match(jsonlPath, /deoptigate\.jsonl$/, 'uses a JSONL filename')
    t.assert.equal(fs.readFileSync(jsonlPath, 'utf8'), '{"file":"app.js"}', 'writes JSON Lines data')
    t.assert.equal(jsonlMode & 0o077, 0, 'does not expose the JSONL report to other users')
  } finally {
    os.tmpdir = originalTmpdir
    delete require.cache[savePartsPath]
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
