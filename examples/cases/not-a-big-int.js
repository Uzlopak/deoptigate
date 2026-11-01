function addOne(value) {
  return value + 1n
}

for (let i = 0; i < 1000; i++) addOne(1n)
; %OptimizeFunctionOnNextCall(addOne)
addOne(1n)
try {
  addOne(1)
} catch (error) {
  // Keep the demo process successful after the deoptimized operation throws.
}
