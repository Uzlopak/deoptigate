function remainder (left, right) { return left % right }
for (let i = 0; i < 10_000; i++) remainder(20n, 3n)
; %OptimizeFunctionOnNextCall(remainder)
remainder(20n, 3n)
try { remainder(20n, 0n) } catch (_) {}
