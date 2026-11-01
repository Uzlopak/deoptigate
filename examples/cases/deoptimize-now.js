function requestDeoptimization (deoptimize) {
  if (deoptimize) %_DeoptimizeNow()
  return 1
}

for (let i = 0; i < 10_000; i++) requestDeoptimization(false)
; %OptimizeFunctionOnNextCall(requestDeoptimization)
requestDeoptimization(false)
requestDeoptimization(true)
