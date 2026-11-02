'use strict'

const { test } = require('node:test')
const CodeEntry = require('../lib/log-processing/code-entry')
const IcEntry = require('../lib/log-processing/ic-entry')

test('code and IC entries preserve path colons and spaces', (t) => {
  t.plan(4)
  const windowsPath = 'C:\\work dir\\app.js'
  const code = new CodeEntry({
    fnFile: `run ${windowsPath}:12:4`,
    line: 12,
    column: 4,
    isScript: false
  })
  const ic = new IcEntry(`run ${windowsPath}:12:4`, 12, 4)

  t.assert.equal(code.hashmap.functionName, 'run', 'code entry keeps the function name')
  t.assert.equal(code.hashmap.file, windowsPath, 'code entry keeps drive colon and spaces')
  t.assert.equal(ic.hashmap.functionName, 'run', 'IC entry keeps the function name')
  t.assert.equal(ic.hashmap.file, windowsPath, 'IC entry keeps drive colon and spaces')
})

test('code and IC entries accept missing or empty file paths', (t) => {
  t.plan(6)
  const codeWithoutFile = new CodeEntry({
    fnFile: 'anonymous',
    line: -1,
    column: -1,
    isScript: false
  })
  const icWithoutFile = new IcEntry('anonymous', -1, -1)
  const codeWithEmptyFile = new CodeEntry({
    fnFile: 'run ',
    line: -1,
    column: -1,
    isScript: false
  })
  const icWithEmptyFile = new IcEntry('run ', -1, -1)

  t.assert.equal(codeWithoutFile.hashmap.functionName, 'anonymous', 'code keeps a bare function name')
  t.assert.equal(codeWithoutFile.hashmap.file, null, 'code represents a missing path as null')
  t.assert.equal(icWithoutFile.hashmap.functionName, 'anonymous', 'IC keeps a bare function name')
  t.assert.equal(icWithoutFile.hashmap.file, null, 'IC represents a missing path as null')
  t.assert.equal(codeWithEmptyFile.hashmap.file, '', 'code accepts an empty path')
  t.assert.equal(icWithEmptyFile.hashmap.file, '', 'IC accepts an empty path')
})

test('IC entry removes wrapping quotes before parsing its path', (t) => {
  t.plan(2)
  const entry = new IcEntry('"run C:\\work dir\\app.js:12:4"', 12, 4)
  t.assert.equal(entry.hashmap.functionName, 'run', 'keeps the function name')
  t.assert.equal(entry.hashmap.file, 'C:\\work dir\\app.js', 'removes the surrounding quotes and coordinates')
})
