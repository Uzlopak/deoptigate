globalThis.deoptigateConstant = 1

function writeConstant (value) { deoptigateConstant = value }
for (let i = 0; i < 1_000; i++) writeConstant(1)
; %OptimizeMaglevOnNextCall(writeConstant)
writeConstant(1)
writeConstant(2)
