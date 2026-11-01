'use strict'

const test = require('tape')
const mapByFile = require('../lib/grouping/group-by-file')

test('grouping ignores child process preload files on POSIX and Windows', (t) => {
  const preloadPaths = [
    '/repo/bin/soft-exit.js',
    'C:\\repo\\bin\\soft-exit.js',
    '/repo/node_modules/ispawn/preload/soft-exit.js',
    'C:\\repo\\node_modules\\ispawn\\preload\\soft-exit.js'
  ]

  for (const file of preloadPaths) {
    const files = new Map([[ file, { file } ]])
    const groups = mapByFile({ ics: [ { file } ], deopts: [], codes: [] }, files)
    t.equal(groups.size, 0, `ignores ${file}`)
  }
  t.end()
})
