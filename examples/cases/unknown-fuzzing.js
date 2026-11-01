// V8's fuzzing mode creates a lazy deopt entry without a specific reason.
// This is the minimal form of V8's deopt-now-fuzzing.js regression test.
function deoptNow (deopt) {
  if (deopt) %DeoptimizeNow()
  return 42
}

; %PrepareFunctionForOptimization(deoptNow)
deoptNow(false)
; %OptimizeFunctionOnNextCall(deoptNow)
deoptNow(false)
deoptNow(true)
