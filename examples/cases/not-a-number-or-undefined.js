// Candidate for runtimes with undefined-double support enabled. On current
// Node 24/26 builds this feature is disabled, so the exact deopt reason may not
// be reachable from this JavaScript pattern.
function loop (value, count) {
  let result = 0
  while (count-- > 0) result = (count & 1) ? undefined : value
  return result * 2
}

%PrepareFunctionForOptimization(loop)
for (let i = 0; i < 100; i++) loop(1.5, 5)
; %OptimizeMaglevOnNextCall(loop)
loop(1.5, 5)
loop(true, 5)
