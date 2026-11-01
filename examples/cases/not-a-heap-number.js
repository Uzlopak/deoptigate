function toInt32 (value) { return value | 0 }
for (let i = 0; i < 5_000; i++) toInt32(1.5)
; %OptimizeFunctionOnNextCall(toInt32)
toInt32(1.5)
try { toInt32(1n) } catch (_) {}
