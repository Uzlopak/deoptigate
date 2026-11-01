function isEqual (left, right) { return left == right }
const first = {}
const second = {}
for (let i = 0; i < 1_000; i++) isEqual(first, second)
; %OptimizeFunctionOnNextCall(isEqual)
isEqual(first, second)
isEqual(first, String.fromCharCode(120))
