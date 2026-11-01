function call (flag, fn, args) {
  if (flag) return fn(...args)
  return 0
}

const fn = () => 1
const args = []
; %PrepareFunctionForOptimization(call)
for (let i = 0; i < 1000; i++) call(false, fn, args)
; %OptimizeFunctionOnNextCall(call)
call(false, fn, args)
call(true, fn, args)
