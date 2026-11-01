'use strict'

const fs = require('fs')
const path = require('path')

// Test-only aliases for human-readable reason strings written to V8 logs.
// Generated snapshots come from each major's lowest V8 git tag. The fallback
// aliases cover messages observed in Node builds that differ from that tag.
const generatedPath = path.join(__dirname, 'fixtures/v8-deopt-reason-aliases.json')
const generatedAliasesByMajor = fs.existsSync(generatedPath)
  ? require(generatedPath)
  : {}
const observedAliasesByMajor = Object.create(null)
for (let major = 8; major <= 15; major++) {
  observedAliasesByMajor[major] = {
    'array buffer was detached': 'ArrayBufferWasDetached',
    'array buffer was detached or immutable': 'ArrayBufferWasDetached'
  }
}
observedAliasesByMajor[11]['weak objects'] = 'WeakObjects'

function createReasonLookup(reasons, v8Major) {
  const aliases = Object.create(null)

  if (v8Major < 8) return aliases

  for (const { name, message } of reasons) {
    aliases[message] = name
  }

  // Merge the versioned header mapping and observed Node-specific spellings
  // into the same description-to-ID lookup object.
  return Object.assign(
    aliases,
    generatedAliasesByMajor[v8Major] || {},
    observedAliasesByMajor[v8Major] || {}
  )
}

function reasonIdsForMajor(v8Major) {
  const aliases = generatedAliasesByMajor[v8Major]
  if (!aliases) return null

  const ids = new Set()
  for (const value of Object.values(aliases)) {
    for (const id of (Array.isArray(value) ? value : [value])) ids.add(id)
  }
  return ids
}

module.exports = { createReasonLookup, reasonIdsForMajor }
