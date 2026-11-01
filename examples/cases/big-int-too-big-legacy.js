// V8 10's TurboFan does not deoptimize oversized BigInt shifts, but its
// optimized BigInt addition does deopt when the result exceeds the maximum
// supported BigInt length.
function addBigInts (left, right) { return left + right }
; %PrepareFunctionForOptimization(addBigInts)
for (let i = 0; i < 100; i++) addBigInts(1n, 2n)
; %OptimizeFunctionOnNextCall(addBigInts)
addBigInts(1n, 2n)

const largestBit = 1n << ((1n << 30n) - 1n)
try {
  addBigInts(largestBit, largestBit)
} catch (error) {
  if (!(error instanceof RangeError)) throw error
}
