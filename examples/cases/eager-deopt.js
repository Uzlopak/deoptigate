// This forces OSR, then hits an eager type guard with a non-Smi value.
// V8's eager-deopt handler marks optimized code with the internal EagerDeopt
// reason while cleaning up OSR state. It deliberately suppresses a separate
// trace for that bookkeeping reason; --log-deopt records the initiating
// deoptimization reason instead (here, "not a Smi").
function run (value) {
  let sum = 0
  for (let i = 0; i < 1_000; i++) {
    if (i === 20) %OptimizeOsr()
    sum += value
  }
  return sum
}

; %PrepareFunctionForOptimization(run)
for (let i = 0; i < 20; i++) run(1)
run(1.5)
