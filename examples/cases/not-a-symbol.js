function same(a, b) { return a === b }
const a = Symbol('a')
const b = Symbol('b')
for (let i = 0; i < 10_000; i++) same(a, b)
; %OptimizeFunctionOnNextCall(same)
same(a, b)
same('a', 'b')
