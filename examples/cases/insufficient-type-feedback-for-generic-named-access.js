function read(flag, object) { if (flag) return object.x; return 0 }
const object = { x: 1 }
for (let i = 0; i < 1000; i++) read(false, object)
; %OptimizeFunctionOnNextCall(read)
read(false, object)
read(true, object)
