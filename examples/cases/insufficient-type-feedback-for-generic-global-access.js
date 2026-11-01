globalThis.deoptigateFeedbackGlobal = 1
function read(flag) { if (flag) return deoptigateFeedbackGlobal; return 0 }
for (let i = 0; i < 1000; i++) read(false)
; %OptimizeFunctionOnNextCall(read)
read(false)
read(true)
