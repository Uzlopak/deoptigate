let iterations = 0

function runLoop(start) {
  let value = start
  while (value < 1000) {
    iterations++
    value++
  }
  return value
}

; %PrepareFunctionForOptimization(runLoop)
runLoop(700)
runLoop(700)
; %OptimizeFunctionOnNextCall(runLoop)
runLoop(700)
