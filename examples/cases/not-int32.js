function divide (left, right) { return left / right }
for (let i = 1; i < 1_000; i++) divide(i * 4, 4)
; %OptimizeMaglevOnNextCall(divide)
divide(8, 4)
divide(1, 2)
