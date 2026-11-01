function divideExactly(a, b) {
  return a / b
}

for (let i = 1; i <= 1000; i++) divideExactly(i * 8, 8)
; %OptimizeFunctionOnNextCall(divideExactly)
divideExactly(16, 8)
divideExactly(7, 8)
