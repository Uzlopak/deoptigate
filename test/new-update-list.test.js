'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { execFileSync } = require('node:child_process')

const newUpdateList = require('../lib/log-processing/new-update-list')

test('every update list is a separate, empty array', () => {
  const first = newUpdateList()
  first.push({ timestamp: 1 })
  assert.deepStrictEqual(newUpdateList(), [], 'pushing to one list leaves new ones empty')
  assert.notStrictEqual(newUpdateList(), newUpdateList())
})

test('update lists start with object elements, so the first push cannot deoptimize', () => {
  const output = execFileSync(process.execPath, [
      '--allow-natives-syntax'
    , '-p', `%HasObjectElements(require(${JSON.stringify(require.resolve('../lib/log-processing/new-update-list'))})())`
  ], { encoding: 'utf8' })
  assert.equal(output.trim(), 'true')
})
