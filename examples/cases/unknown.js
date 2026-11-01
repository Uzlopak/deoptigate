// V8 emits this lazy OSR-cleanup event alongside the value-mismatch eager
// deopt from the same global-property transition.
globalThis.limit = 1

function setLimit (value) {
  limit = value
  return limit
}

for (let i = 0; i < 50_000; i++) setLimit(1)
setLimit(2)
