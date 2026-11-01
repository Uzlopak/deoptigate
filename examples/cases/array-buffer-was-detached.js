function collect (array) { return Array.from(array) }
for (let i = 0; i < 1_000; i++) collect(new Uint8Array([1, 2, 3]))
; %OptimizeFunctionOnNextCall(collect)
collect(new Uint8Array([1, 2, 3]))
const firstBuffer = new ArrayBuffer(3)
const firstView = new Uint8Array(firstBuffer)
firstView.set([1, 2, 3])
structuredClone(firstBuffer, { transfer: [firstBuffer] })
try { collect(firstView) } catch (_) {}

function readNext (array) { return array.values().next().value }
for (let i = 0; i < 1_000; i++) readNext(new Uint8Array([1, 2]))
; %OptimizeFunctionOnNextCall(readNext)
readNext(new Uint8Array([1, 2]))
const buffer = new ArrayBuffer(2)
const view = new Uint8Array(buffer)
structuredClone(buffer, { transfer: [buffer] })
try { readNext(view) } catch (_) {}
