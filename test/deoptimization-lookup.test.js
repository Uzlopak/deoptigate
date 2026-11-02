'use strict'

const { test } = require('node:test')
const lookupDeoptimizationReason = require('../src/deoptimization-lookup')
const ClinicDeoptigate = require('../src')

test('deoptimization reason lookup returns structured catalog entries', (t) => {
  t.plan(5)
  const reason = lookupDeoptimizationReason('Hole')

  t.assert.equal(reason.code, 'Hole', 'returns the requested reason code')
  t.assert.equal(reason.type, 'regular', 'identifies the regular deoptimization category')
  t.assert.equal(reason.message, 'hole', 'returns the V8 log message')
  t.assert.match(reason.meaning, /missing array element/, 'returns the explanation and guidance')
  t.assert.deepEqual(reason.examples, [
    'Build a ten-element array, assign `a[12]`, warm `read(a, 0)`, then call `read(a, 10)`',
    null,
    null
  ], 'returns the examples in their source order')
})

test('deoptimization reason lookup finds lazy reasons and ignores unknown codes', (t) => {
  t.plan(3)
  t.assert.equal(lookupDeoptimizationReason('MapDeprecated').type, 'lazy', 'identifies lazy deoptimization reasons')
  t.assert.equal(lookupDeoptimizationReason('NotAReason'), null, 'returns null for an unknown reason code')
  t.assert.equal(lookupDeoptimizationReason(null), null, 'returns null for non-string input')
})

test('deoptimization reason lookup trims the key and protects the catalog from mutation', (t) => {
  t.plan(2)
  const reason = lookupDeoptimizationReason(' Hole ')
  reason.examples[0] = 'changed'

  t.assert.equal(reason.code, 'Hole', 'normalizes surrounding whitespace in the key')
  t.assert.notEqual(lookupDeoptimizationReason('Hole').examples[0], 'changed', 'returns a copy of mutable example data')
})

test('Deoptigate provides a meaning-only lookup tool for Clinic to register', (t) => {
  t.plan(5)
  const tools = ClinicDeoptigate.getMcpTools({
    z: {
      string: () => ({ trim () { return this }, min () { return this }, max () { return this }, describe () { return this } }),
      object: fields => ({ fields, strict () { return this } })
    }
  })
  const tool = tools[0]
  const result = tool.handler({ reason_code: 'Hole' })

  t.assert.equal(tool.name, 'lookup_deoptimization_reason', 'declares a stable MCP tool name')
  t.assert.deepEqual(Object.keys(tool.config.outputSchema.fields).sort(), [ 'code', 'meaning' ], 'limits the output schema to the reason code and meaning')
  t.assert.equal(result.structuredContent.code, 'Hole', 'returns the reason code alongside its meaning')
  t.assert.match(result.structuredContent.meaning, /missing array element/, 'returns the actionable explanation')
  t.assert.equal(tool.handler({ reason_code: 'NotAReason' }).isError, true, 'reports unknown reason codes')
})
