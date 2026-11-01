function same(a, b) { return a === b }
for (let i = 0; i < 10_000; i++) same('a', 'b')
; %OptimizeFunctionOnNextCall(same)
same('a', 'b')
same(1, 2)
