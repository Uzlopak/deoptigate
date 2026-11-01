function construct(flag, C) { if (flag) return new C(); return null }
for (let i = 0; i < 1000; i++) construct(false, Object)
; %OptimizeFunctionOnNextCall(construct)
construct(false, Object)
construct(true, Object)
