function allocate (length) { return new Array(length) }
for (let i = 0; i < 1_000; i++) allocate(4)
; %OptimizeMaglevOnNextCall(allocate)
allocate(4)
allocate(300_000)
