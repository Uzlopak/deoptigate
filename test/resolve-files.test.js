'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const { test } = require('node:test')

const resolveFiles = require('../lib/grouping/resolve-files')

test('resolveFiles reads unique readable source files and skips missing paths and directories', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deoptigate-resolve-files-'))
  const source = path.join(root, 'source.js')
  const directory = path.join(root, 'directory')
  fs.writeFileSync(source, 'module.exports = 42\n')
  fs.mkdirSync(directory)

  try {
    const files = await resolveFiles({
      root,
      ics: [{ file: 'source.js' }, { file: 'missing.js' }],
      deopts: [{ file: 'directory' }],
      codes: [{ file: 'source.js' }]
    })

    t.assert.equal(files.size, 1, 'only readable regular files are returned')
    t.assert.deepEqual(files.get('source.js'), {
      fullPath: source,
      relativePath: 'source.js',
      src: 'module.exports = 42\n'
    }, 'source content and paths are returned')
    t.assert.equal(files.has('missing.js'), false, 'missing files are skipped')
    t.assert.equal(files.has('directory'), false, 'directories are skipped')
  } finally {
    fs.unlinkSync(source)
    fs.rmdirSync(directory)
    fs.rmdirSync(root)
  }
})

test('resolveFiles reads files referenced by file URLs', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deoptigate-resolve-files-'))
  const source = path.join(root, 'module.mjs')
  const url = pathToFileURL(source).href
  fs.writeFileSync(source, 'export default 42\n')

  try {
    const files = await resolveFiles({ root, ics: [], deopts: [{ file: url }], codes: [] })
    t.assert.deepEqual(files.get(url), {
      fullPath: source,
      relativePath: 'module.mjs',
      src: 'export default 42\n'
    }, 'the URL is resolved to its file')
    t.assert.equal(files.size, 1, 'the URL resolves to a single file')
  } finally {
    fs.unlinkSync(source)
    fs.rmdirSync(root)
  }
})

test('resolveFiles skips malformed file URLs', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const files = await resolveFiles({
    root: os.tmpdir(),
    ics: [],
    deopts: [{ file: 'file://remote-host/module.mjs' }, { file: 'file:///%2Fencoded-slash.mjs' }],
    codes: []
  })
  t.assert.equal(files.size, 0, 'unusable URLs are omitted like missing files')
})

test('resolveFiles returns an empty map when there are no data points', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const files = await resolveFiles({ root: os.tmpdir(), ics: [], deopts: [], codes: [] })
  t.assert.equal(files.size, 0, 'empty input resolves to no files')
})
