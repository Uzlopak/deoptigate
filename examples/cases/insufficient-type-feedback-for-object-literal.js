function build(flag, value) { if (flag) return { value }; return null }
for (let i = 0; i < 1000; i++) build(false, i)
; %OptimizeFunctionOnNextCall(build)
build(false, 1)
build(true, 1)
