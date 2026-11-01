function typeOf(flag, value) { if (flag) return typeof value; return 'unused' }
for (let i = 0; i < 1000; i++) typeOf(false, 1)
; %OptimizeFunctionOnNextCall(typeOf)
typeOf(false, 1)
typeOf(true, 1)
