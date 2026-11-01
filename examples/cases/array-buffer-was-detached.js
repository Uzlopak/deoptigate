// Invalidate V8's detaching protector before compiling the target function.
// This makes the optimized operation emit an explicit buffer-validity guard
// instead of depending on the protector and deoptimizing for that dependency.
const protectorBuffer = new ArrayBuffer(1)
new DataView(protectorBuffer)
structuredClone(protectorBuffer, { transfer: [protectorBuffer] })

const buffer = new ArrayBuffer(4)
const view = new DataView(buffer)

function readByte (dataView) {
  try {
    return dataView.getInt8(0)
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    return -1
  }
}

; %PrepareFunctionForOptimization(readByte)
for (let i = 0; i < 100; i++) readByte(view)
; %OptimizeFunctionOnNextCall(readByte)
readByte(view)

// The explicit validity guard now fails and deoptimizes with
// ArrayBufferWasDetached before DataView throws for the detached view.
structuredClone(buffer, { transfer: [buffer] })
readByte(view)
