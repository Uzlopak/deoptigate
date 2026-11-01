function readAll(object) {
  let sum = 0
  for (const key in object) sum += object[key]
  return sum
}

const parent = { a: 1, b: 2 }
for (let i = 0; i < 1000; i++) readAll(parent)

; %OptimizeFunctionOnNextCall(readAll)
readAll(parent)

// The child shares the parent's descriptor array and enum cache. Initializing
// its cache after adding an accessor clears the shared indices array, while
// the parent's map still has a non-zero enum length.
const child = { a: 3, b: 4 }
Object.defineProperty(child, 'c', {
  enumerable: true,
  configurable: true,
  get() { return 5 }
})
readAll(child)

// The optimized parent path now sees the cleared shared enum indices.
readAll(parent)
