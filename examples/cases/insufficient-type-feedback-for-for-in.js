function enumerate(flag, object) {
  if (flag) {
    let count = 0
    for (const key in object) count++
    return count
  }
  return 0
}
const object = { x: 1 }
for (let i = 0; i < 1000; i++) enumerate(false, object)
; %OptimizeFunctionOnNextCall(enumerate)
enumerate(false, object)
enumerate(true, object)
