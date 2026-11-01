let shouldThrow = false

function callback () {
  if (shouldThrow) throw 42
  return 1
}

function run () {
  try { return callback() } catch (_) { return 17 }
}

for (let i = 0; i < 10_000; i++) run()
; %OptimizeMaglevOnNextCall(run)
run()
shouldThrow = true
run()
