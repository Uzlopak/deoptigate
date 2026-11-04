'use strict'

const path = require('path')
const { test } = require('node:test')
const mapByFile = require('../lib/grouping/group-by-file')

test('grouping ignores this package\'s preload files', (/** @type {import('node:test').TestContext} */ t) => {
  const preloadPaths = [
    path.join(__dirname, '../bin/soft-exit.js'),
    path.join(__dirname, '../src/injects/soft-exit.js'),
    path.join(__dirname, '../src/injects/detect-port.js'),
    '/repo/node_modules/ispawn/preload/soft-exit.js',
    'C:\\repo\\node_modules\\ispawn\\preload\\soft-exit.js'
  ]
  t.plan(preloadPaths.length)

  for (const file of preloadPaths) {
    /** @type {Map<string, { fullPath: string, relativePath: string, src: string }>} */
    const files = new Map([[ file, { fullPath: file, relativePath: file, src: '' } ]])
    const groups = mapByFile({ ics: [ { file } ], deopts: [], codes: [] }, files)
    t.assert.equal(groups.size, 0, `ignores ${file}`)
  }
})
