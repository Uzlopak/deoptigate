function read(flag, object, key) { if (flag) return object[key]; return 0 }
const object = { x: 1 }
for (let i = 0; i < 1000; i++) read(false, object, 'x')
; %OptimizeFunctionOnNextCall(read)
read(false, object, 'x')
read(true, object, 'x')
