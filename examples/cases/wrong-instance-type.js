const view = new DataView(new ArrayBuffer(8))
const getInt8 = DataView.prototype.getInt8

function readByte(receiver) {
  return getInt8.call(receiver, 0)
}

; %PrepareFunctionForOptimization(readByte)
readByte(view)
readByte(view)
; %OptimizeMaglevOnNextCall(readByte)
readByte(view)

try {
  readByte({})
} catch (error) {
  // DataView's generic builtin throws after the optimized type guard deopts.
}
