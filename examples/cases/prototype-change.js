const object = { x: 1 }
function readX (value) { return value.x }
for (let i = 0; i < 10_000; i++) readX(object)
; %OptimizeFunctionOnNextCall(readX)
readX(object)
Object.setPrototypeOf(object, { x: 2 })
