globalThis.deoptigateLimit = 1
function readLimit () { return globalThis.deoptigateLimit }
for (let i = 0; i < 10_000; i++) readLimit()
; %OptimizeFunctionOnNextCall(readLimit)
readLimit()
globalThis.deoptigateLimit = 2
readLimit()
