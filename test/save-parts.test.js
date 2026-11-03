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
    const { savePage, saveEntry } = require(savePartsPath)
    const pagePath = savePage('<html></html>')
    saveEntry('{"files":[]}')
    const entryPath = path.join(tempRoot, 'deoptigate', 'deoptigate.render-data.js')
    const directoryMode = fs.statSync(path.dirname(pagePath)).mode & 0o777
    const pageMode = fs.statSync(pagePath).mode & 0o777
    const entryMode = fs.statSync(entryPath).mode & 0o777

    t.assert.equal(directoryMode & 0o077, 0, 'does not expose the report directory to other users')
    t.assert.equal(pageMode & 0o077, 0, 'does not expose the HTML report to other users')
    t.assert.equal(entryMode & 0o077, 0, 'does not expose embedded source data to other users')
  } finally {
    os.tmpdir = originalTmpdir
    delete require.cache[savePartsPath]
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
