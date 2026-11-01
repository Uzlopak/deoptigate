function sum (array) { return array.reduce((left, right) => left + right) }
for (let i = 0; i < 10_000; i++) sum([1, 2, 3])
; %OptimizeFunctionOnNextCall(sum)
sum([1, 2, 3])
try { sum([]) } catch (_) {}
