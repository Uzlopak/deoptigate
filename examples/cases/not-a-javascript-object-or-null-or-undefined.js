function same(a, b) { return a === b }
const receiver = {}
for (let i = 0; i < 5_000; i++) {
  same(receiver, null)
  same(receiver, undefined)
}
; %OptimizeFunctionOnNextCall(same)
same(receiver, null)
same(1, null)
