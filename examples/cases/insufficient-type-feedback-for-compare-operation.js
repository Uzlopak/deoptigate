function compare(flag, a, b) { if (flag) return a < b; return false }
for (let i = 0; i < 1000; i++) compare(false, 1, 2)
; %OptimizeFunctionOnNextCall(compare)
compare(false, 1, 2)
compare(true, 1, 2)
