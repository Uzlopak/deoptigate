function readIndex (array, index) { return array[index] + 1 }
const array = new Int32Array([1, 2])
for (let i = 0; i < 10_000; i++) readIndex(array, 0)
; %OptimizeFunctionOnNextCall(readIndex)
readIndex(array, 0)
readIndex(array, 10)
