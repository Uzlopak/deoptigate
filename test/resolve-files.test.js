'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('tape')

const resolveFiles = require('../lib/grouping/resolve-files')

test('resolveFiles reads unique readable source files and skips missing paths and directories', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deoptigate-resolve-files-'))
  const source = path.join(root, 'source.js')
  const directory = path.join(root, 'directory')
  fs.writeFileSync(source, 'module.exports = 42\n')
  fs.mkdirSync(directory)

  try {
    const files = await resolveFiles({
      root,
      ics: [ { file: 'source.js' }, { file: 'missing.js' } ],
      deopts: [ { file: 'directory' } ],
      codes: [ { file: 'source.js' } ]
    })

    t.equal(files.size, 1, 'only readable regular files are returned')
    t.deepEqual(files.get('source.js'), {
      fullPath: source,
      relativePath: 'source.js',
      src: 'module.exports = 42\n'
    }, 'source content and paths are returned')
    t.notOk(files.has('missing.js'), 'missing files are skipped')
    t.notOk(files.has('directory'), 'directories are skipped')
  } finally {
    fs.unlinkSync(source)
    fs.rmdirSync(directory)
    fs.rmdirSync(root)
  }

  t.end()
})

test('resolveFiles returns an empty map when there are no data points', async (t) => {
  const files = await resolveFiles({ root: os.tmpdir(), ics: [], deopts: [], codes: [] })
  t.equal(files.size, 0, 'empty input resolves to no files')
  t.end()
})
