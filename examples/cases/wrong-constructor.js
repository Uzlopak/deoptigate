function construct (Constructor, length) { return new Constructor(length) }
for (let i = 0; i < 10_000; i++) construct(Array, 1)
; %OptimizeFunctionOnNextCall(construct)
construct(Array, 1)
construct(Date, 1)
