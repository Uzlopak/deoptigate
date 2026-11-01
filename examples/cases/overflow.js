function add(a, b) { return a + b }
for (let i = 0; i < 10000; i++) add(i, 1)
; %OptimizeFunctionOnNextCall(add)
add(1, 2)
add(2147483647, 1)
