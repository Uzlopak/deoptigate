function addOne (value) { return value + 1 }
function subtractOne (value) { return value - 1 }
function callTarget (callback, value) { return callback(value) }
for (let i = 0; i < 10_000; i++) callTarget(addOne, i)
; %OptimizeFunctionOnNextCall(callTarget)
callTarget(addOne, 1)
callTarget(subtractOne, 1)
