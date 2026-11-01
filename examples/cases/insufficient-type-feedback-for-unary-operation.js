function negate(flag, value) { if (flag) return -value; return 0 }
for (let i = 0; i < 1000; i++) negate(false, 1)
; %OptimizeFunctionOnNextCall(negate)
negate(false, 1)
negate(true, 1)
