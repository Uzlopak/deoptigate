function read (values, index) { return values[index] }

const values = new Uint32Array(8)
for (let i = 0; i < 500; i++) read(values, i % values.length)
; %OptimizeMaglevOnNextCall(read)
read(values, 0)
read(values, -1)
