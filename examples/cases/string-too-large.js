function concat (string) {
  // The long literal makes Maglev build a ConsString known to be non-empty.
  // The second concatenation then checks the combined rope length.
  const leftCons = 'abcdefghijklmnop' + string
  return string + leftCons
}

const small = 'x'.repeat(100)
; %PrepareFunctionForOptimization(concat)
for (let i = 0; i < 10; i++) concat(small)
; %OptimizeMaglevOnNextCall(concat)
concat(small)

// Keep the representation as a rope: 28 doublings have a 2^28 logical
// length while requiring only a small number of ConsString nodes.
let string = 'x'
for (let i = 0; i < 28; i++) string = string + string

try {
  concat(string)
} catch (error) {
  if (!(error instanceof RangeError)) throw error
}
