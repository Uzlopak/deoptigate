'use strict'

const lookupDeoptimizationReason = require('./deoptimization-lookup')

function getMcpTools ({ z }) {
  return [{
    name: 'lookup_deoptimization_reason',
    config: {
      description: 'Look up the meaning of a V8 deoptimization reason code, such as Hole.',
      inputSchema: {
        reason_code: z.string().trim().min(1).max(80).describe('Exact V8 deoptimization reason code, for example Hole.')
      },
      outputSchema: z.object({
        code: z.string(),
        meaning: z.string()
      }).strict()
    },
    handler ({ reason_code: reasonCode }) {
      const reason = lookupDeoptimizationReason(reasonCode)
      if (reason == null) {
        return {
          isError: true,
          content: [{ type: 'text', text: `unknown V8 deoptimization reason code: ${reasonCode}` }]
        }
      }
      return {
        content: [{ type: 'text', text: reason.meaning }],
        structuredContent: { code: reason.code, meaning: reason.meaning }
      }
    }
  }]
}

module.exports = getMcpTools
