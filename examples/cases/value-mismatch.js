// The global-property transition causes a value-mismatch eager deopt and an
// associated OSR-cleanup event. The companion `unknown.js` documents that
// lazy event separately.
globalThis.limit = 1

function setLimit (value) {
  limit = value
  return limit
}

for (let i = 0; i < 50_000; i++) setLimit(1)
setLimit(2)
