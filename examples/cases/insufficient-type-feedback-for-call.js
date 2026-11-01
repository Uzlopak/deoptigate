function call(flag, fn) { if (flag) return fn(); return 0 }
const fn = () => 1
for (let i = 0; i < 1000; i++) call(false, fn)
; %OptimizeFunctionOnNextCall(call)
call(false, fn)
call(true, fn)
