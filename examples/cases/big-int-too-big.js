function shiftLeft (value, bits) { return value << bits }
%PrepareFunctionForOptimization(shiftLeft)
shiftLeft(1n, 5n)
shiftLeft(2n, 4n)
; %OptimizeFunctionOnNextCall(shiftLeft)
shiftLeft(1n, 5n)
try {
  shiftLeft(1n, 2n ** 30n)
} catch (error) {
  if (!(error instanceof RangeError)) throw error
}
