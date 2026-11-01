'use strict'

const test = require('tape')
const CodeEntry = require('../lib/log-processing/code-entry')
const IcEntry = require('../lib/log-processing/ic-entry')

test('code and IC entries preserve path colons and spaces', (t) => {
  const windowsPath = 'C:\\work dir\\app.js'
  const code = new CodeEntry({
    fnFile: `run ${windowsPath}:12:4`,
    line: 12,
    column: 4,
    isScript: false
  })
  const ic = new IcEntry(`run ${windowsPath}:12:4`, 12, 4)

  t.equal(code.hashmap.functionName, 'run', 'code entry keeps the function name')
  t.equal(code.hashmap.file, windowsPath, 'code entry keeps drive colon and spaces')
  t.equal(ic.hashmap.functionName, 'run', 'IC entry keeps the function name')
  t.equal(ic.hashmap.file, windowsPath, 'IC entry keeps drive colon and spaces')
  t.end()
})

test('code and IC entries accept missing or empty file paths', (t) => {
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

  t.equal(codeWithoutFile.hashmap.functionName, 'anonymous', 'code keeps a bare function name')
  t.equal(codeWithoutFile.hashmap.file, null, 'code represents a missing path as null')
  t.equal(icWithoutFile.hashmap.functionName, 'anonymous', 'IC keeps a bare function name')
  t.equal(icWithoutFile.hashmap.file, null, 'IC represents a missing path as null')
  t.equal(codeWithEmptyFile.hashmap.file, '', 'code accepts an empty path')
  t.equal(icWithEmptyFile.hashmap.file, '', 'IC accepts an empty path')
  t.end()
})

test('IC entry removes wrapping quotes before parsing its path', (t) => {
  const entry = new IcEntry('"run C:\\work dir\\app.js:12:4"', 12, 4)
  t.equal(entry.hashmap.functionName, 'run', 'keeps the function name')
  t.equal(entry.hashmap.file, 'C:\\work dir\\app.js', 'removes the surrounding quotes and coordinates')
  t.end()
})
