function add(flag, a, b) { if (flag) return a + b; return 0 }
for (let i = 0; i < 1000; i++) add(false, 1, 2)
; %OptimizeFunctionOnNextCall(add)
add(false, 1, 2)
add(true, 1, 2)
