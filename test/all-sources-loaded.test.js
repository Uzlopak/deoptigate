'use strict'

const fs = require('fs')
const path = require('path')
const test = require('node:test')

const ROOT = path.join(__dirname, '..')
const DIRECTORIES = ['app/components', 'app/lib', 'bin', 'lib', 'src']
// Scripts that act on load; their behaviour is tested by running them
const RUN_ON_LOAD = new Set(['bin/demo.js', 'bin/soft-exit.js', 'src/injects/detect-port.js', 'src/injects/soft-exit.js'])

/**
 * @param {string} directory
 * @returns {string[]}
 */
function sourceFiles (directory) {
  return fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => path.relative(ROOT, path.join(entry.parentPath, entry.name)))
}

// The coverage report omits files nobody loaded, so a forgotten file would pass the gate
test('every source file is loaded, so the coverage gate reports it', (/** @type {import('node:test').TestContext} */ t) => {
  require('./support/jsx-hook')
  const files = ['deoptigate.js', 'deoptigate.log.js', 'app/main.js', 'app/theme.browser.js', ...DIRECTORIES.flatMap(sourceFiles)]
  t.assert.ok(files.length > 30, 'finds the sources')
  for (const file of files) {
    if (!RUN_ON_LOAD.has(file)) require(path.join(ROOT, file))
  }
})
