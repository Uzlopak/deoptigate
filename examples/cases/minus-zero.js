function negate(value) {
  return value * -1
}

for (let i = 1; i <= 1000; i++) negate(i)
; %OptimizeFunctionOnNextCall(negate)
negate(2)
negate(0)
