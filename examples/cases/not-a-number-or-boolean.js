function equal (left, right) { return left == right }
for (let i = 0; i < 1_000; i++) equal(2, true)
; %OptimizeMaglevOnNextCall(equal)
equal(2, true)
equal(2, '2')
