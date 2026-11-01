function addBigInts (left, right) { return left + right }
for (let i = 0; i < 1_000; i++) addBigInts(1n, 2n)
; %OptimizeFunctionOnNextCall(addBigInts)
addBigInts(1n, 2n)
addBigInts(9223372036854775808n, 0n)
