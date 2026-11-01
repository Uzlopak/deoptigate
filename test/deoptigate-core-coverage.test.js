'use strict'

const path = require('path')
const test = require('tape')
const { processLogContent } = require('../deoptigate')

const repoRoot = path.join(__dirname, '..')

test('processor handles code deletion and reports errors when configured', async (t) => {
  const processor = await processLogContent([], repoRoot)
  const sourceFile = path.join(repoRoot, 'examples/simple/adders.js')

  processor.processString([
    `code-creation,JS,9,1,0x1234,100,deletedFn ${sourceFile}:1:1,0x2000,~`,
    'code-delete,0x1234',
    `code-deopt,3,100,0x1234,-1,12,deopt-eager,<${sourceFile}:9:3>,after deletion`
  ].join('\n') + '\n')
  const deopts = processor.toObject().deopts
  t.equal(deopts.length, 1, 'deopt record is retained after code deletion')
  t.equal(deopts[0].functionName, '', 'deleted code no longer resolves to its former function')

  let traceCalls = 0
  const errors = []
  const originalTrace = console.trace
  const originalError = console.error
  processor._silentErrors = false
  console.trace = () => { traceCalls++ }
  console.error = message => { errors.push(message) }
  try {
    processor.printError('synthetic parser error')
  } finally {
    console.trace = originalTrace
    console.error = originalError
  }

  t.equal(traceCalls, 1, 'an error prints a trace when silent errors are disabled')
  t.deepEqual(errors, [ 'synthetic parser error' ], 'the error message is printed')
  t.end()
})

test('processor handles names without positions, missing code, and non-wrapper scripts', async (t) => {
  const processor = await processLogContent([], repoRoot)
  const sourceFile = path.join(repoRoot, 'examples/simple/adders.js')
  const lines = [
    `code-creation,JS,9,1,0x1000,100,plain ${sourceFile},0x2000,~`,
    `code-creation,Script,9,2,0x3000,100,script ${sourceFile}:2:1,0x4000,~`,
    `code-deopt,3,100,0xdead,-1,12,deopt-eager,<${sourceFile}:9:3>,unknown target`
  ]
  processor.processString(lines.join('\n') + '\n')

  const output = processor.toObject()
  t.equal(output.codes.length, 1, 'script code outside the Node wrapper is filtered')
  t.equal(output.codes[0].functionName, 'plain', 'a name without line and column is retained')
  t.equal(output.codes[0].line, -1, 'missing source positions use the unknown line')
  t.equal(output.deopts[0].functionName, '', 'a deopt without a matching code entry has an empty function name')
  t.end()
})
