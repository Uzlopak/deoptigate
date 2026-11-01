function callback (shouldThrow) {
  if (shouldThrow) throw 42
  return 1
}

function run (shouldThrow) {
  try { return callback(shouldThrow) } catch (_) { return 17 }
}

for (let i = 0; i < 10_000; i++) run(false)
; %OptimizeMaglevOnNextCall(run)
run(false)
run(true)
