function read (array, index) { return array[index] }
const values = [1, 2, 3]
for (let i = 0; i < 5_000; i++) read(values, i % values.length)
; %OptimizeFunctionOnNextCall(read)
read(values, 1)
read(values, 'not-an-index')
