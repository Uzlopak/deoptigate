function read (values, index) { return values[index] }

// Train the keyed-load feedback to tolerate out-of-bounds reads. Maglev then
// uses its Uint32 index path (rather than the ordinary OutOfBounds guard).
const values = new Array(8).fill(1)
for (let i = 0; i < 500; i++) read(values, i % values.length)
read(values, values.length)
; %OptimizeMaglevOnNextCall(read)
read(values, 0)
read(values, -1)
