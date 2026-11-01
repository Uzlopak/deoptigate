function divide (left, right) { return left / right }
; %PrepareFunctionForOptimization(divide)
for (let i = 0; i < 100; i++) divide(20, 10)
; %OptimizeFunctionOnNextCall(divide)
divide(20, 10)
// TurboFan's checked int32 division deopts to preserve JavaScript's Infinity
// result when the divisor becomes zero.
divide(1, 0)
