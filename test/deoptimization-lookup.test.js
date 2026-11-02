'use strict'

const test = require('tape')
const lookupDeoptimizationReason = require('../src/deoptimization-lookup')
const ClinicDeoptigate = require('../src')

test('deoptimization reason lookup returns structured catalog entries', (t) => {
  const reason = lookupDeoptimizationReason('Hole')

  t.equal(reason.code, 'Hole', 'returns the requested reason code')
  t.equal(reason.type, 'regular', 'identifies the regular deoptimization category')
  t.equal(reason.message, 'hole', 'returns the V8 log message')
  t.match(reason.meaning, /missing array element/, 'returns the explanation and guidance')
  t.deepEqual(reason.examples, [
    'Build a ten-element array, assign `a[12]`, warm `read(a, 0)`, then call `read(a, 10)`',
    null,
    null
  ], 'returns the examples in their source order')
  t.end()
})

test('deoptimization reason lookup finds lazy reasons and ignores unknown codes', (t) => {
  t.equal(lookupDeoptimizationReason('MapDeprecated').type, 'lazy', 'identifies lazy deoptimization reasons')
  t.equal(lookupDeoptimizationReason('NotAReason'), null, 'returns null for an unknown reason code')
  t.equal(lookupDeoptimizationReason(null), null, 'returns null for non-string input')
  t.end()
})

test('deoptimization reason lookup trims the key and protects the catalog from mutation', (t) => {
  const reason = lookupDeoptimizationReason(' Hole ')
  reason.examples[0] = 'changed'

  t.equal(reason.code, 'Hole', 'normalizes surrounding whitespace in the key')
  t.notEqual(lookupDeoptimizationReason('Hole').examples[0], 'changed', 'returns a copy of mutable example data')
  t.end()
})

test('Deoptigate provides a meaning-only lookup tool for Clinic to register', (t) => {
  const tools = ClinicDeoptigate.getMcpTools({
    z: {
      string: () => ({ trim () { return this }, min () { return this }, max () { return this }, describe () { return this } }),
      object: fields => ({ fields, strict () { return this } })
    }
  })
  const tool = tools[0]
  const result = tool.handler({ reason_code: 'Hole' })

  t.equal(tool.name, 'lookup_deoptimization_reason', 'declares a stable MCP tool name')
  t.equal(tool.config.outputSchema.fields.meaning, 'string', 'limits the output schema to the reason code and meaning')
  t.equal(result.structuredContent.code, 'Hole', 'returns the reason code alongside its meaning')
  t.match(result.structuredContent.meaning, /missing array element/, 'returns the actionable explanation')
  t.equal(tool.handler({ reason_code: 'NotAReason' }).isError, true, 'reports unknown reason codes')
  t.end()
})
