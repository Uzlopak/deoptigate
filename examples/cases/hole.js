function readElement (array, index) { return array[index] + 1 }

const values = Array.from({ length: 10 }, (_, index) => index)
values[12] = 12
for (let i = 0; i < 1_000; i++) readElement(values, 0)
; %OptimizeMaglevOnNextCall(readElement)
readElement(values, 0)
readElement(values, 10)
