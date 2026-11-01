function readX (object) { return object.x }
for (let i = 0; i < 10_000; i++) readX({ x: 1 })
; %OptimizeFunctionOnNextCall(readX)
readX({ x: 1 })
readX({ x: 1, y: 2 })
