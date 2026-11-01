function addOne(value) { return value + 1 }
for (let i = 0; i < 10_000; i++) addOne(i)
; %OptimizeFunctionOnNextCall(addOne)
addOne(1)
addOne(1.5)
