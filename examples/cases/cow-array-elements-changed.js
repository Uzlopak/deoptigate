const values = [10, 20, 30]
function readValue () { return values[1] }
for (let i = 0; i < 1_000; i++) readValue()
; %OptimizeFunctionOnNextCall(readValue)
readValue()
values[1] = 99
readValue()
