let x = 42

function foo(value) {
  x = value
  return x
}

; %PrepareFunctionForOptimization(foo)
foo(42)
foo(42)
; %OptimizeMaglevOnNextCall(foo)
foo(42)

// Changing the specialized script-context cell invalidates optimized code.
x = 4
