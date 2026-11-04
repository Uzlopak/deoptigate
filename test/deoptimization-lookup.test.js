'use strict'

const { test } = require('node:test')
const lookupDeoptimizationReason = require('../src/deoptimization-lookup')
const ClinicDeoptigate = require('../src')

/** @typedef {NonNullable<ReturnType<typeof lookupDeoptimizationReason>>} DeoptimizationReason */
/**
 * @typedef {{
 *   name: string,
 *   config: {outputSchema: {fields: Record<string, unknown>}},
 *   handler: (input: {reason_code: string}) => {isError?: boolean, structuredContent?: {code: string, meaning: string}}
 * }} LookupToolTestShape
 */

/**
 * @param {string} code
 * @returns {DeoptimizationReason}
 */
function requireReason (code) {
  const reason = lookupDeoptimizationReason(code)
  if (reason == null) throw new Error(`Unknown test deoptimization reason: ${code}`)
  return reason
}

test('deoptimization reason lookup returns structured catalog entries', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(5)
  const reason = requireReason('Hole')

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

test('deoptimization reason lookup finds lazy reasons and ignores unknown codes', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  t.assert.equal(requireReason('MapDeprecated').type, 'lazy', 'identifies lazy deoptimization reasons')
  t.assert.equal(lookupDeoptimizationReason('NotAReason'), null, 'returns null for an unknown reason code')
  t.assert.equal(lookupDeoptimizationReason(null), null, 'returns null for non-string input')
})

test('deoptimization reason lookup trims the key and protects the catalog from mutation', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const reason = requireReason(' Hole ')
  reason.examples[0] = 'changed'

  t.assert.equal(reason.code, 'Hole', 'normalizes surrounding whitespace in the key')
  t.assert.notEqual(requireReason('Hole').examples[0], 'changed', 'returns a copy of mutable example data')
})

test('Deoptigate provides a meaning-only lookup tool for Clinic to register', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(5)
  /** @type {LookupToolTestShape[]} */
  const tools = /** @type {LookupToolTestShape[]} */ (/** @type {unknown} */ (ClinicDeoptigate.getMcpTools({
    z: {
      string: () => ({ trim () { return this }, min () { return this }, max () { return this }, describe () { return this } }),
      object: fields => ({ fields, strict () { return this } })
    }
  })))
  const tool = tools[0]
  const result = tool.handler({ reason_code: 'Hole' })
  const structuredContent = result.structuredContent
  if (structuredContent == null) throw new Error('Expected structured deoptimization reason output')

  t.assert.equal(tool.name, 'lookup_deoptimization_reason', 'declares a stable MCP tool name')
  t.assert.deepEqual(Object.keys(tool.config.outputSchema.fields).sort(), ['code', 'meaning'], 'limits the output schema to the reason code and meaning')
  t.assert.equal(structuredContent.code, 'Hole', 'returns the reason code alongside its meaning')
  t.assert.match(structuredContent.meaning, /missing array element/, 'returns the actionable explanation')
  t.assert.equal(tool.handler({ reason_code: 'NotAReason' }).isError, true, 'reports unknown reason codes')
})
