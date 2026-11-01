// Invalidate V8's detaching protector before compiling the target function.
// This makes the optimized operation emit an explicit buffer-validity guard
// instead of depending on the protector and deoptimizing for that dependency.
const protectorBuffer = new ArrayBuffer(1)
new DataView(protectorBuffer)
function detachBuffer (buffer) {
  if (typeof structuredClone === 'function') {
    structuredClone(buffer, { transfer: [buffer] })
    return
  }

  // Node 16 predates structuredClone; MessagePort transfer detaches buffers
  // synchronously on postMessage as well.
  const { MessageChannel } = require('worker_threads')
  const channel = new MessageChannel()
  channel.port1.postMessage(buffer, [buffer])
  channel.port1.close()
  channel.port2.close()
}
detachBuffer(protectorBuffer)

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
detachBuffer(buffer)
readByte(view)
