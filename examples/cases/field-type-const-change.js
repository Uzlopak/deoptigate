const object = { x: 1 }
function readX () { return object.x }
for (let i = 0; i < 10_000; i++) readX()
; %OptimizeFunctionOnNextCall(readX)
readX()
object.x = 2
