function makeSameClosure () {
  return function same (value) { return value + 1 }
}

function makeDifferentClosure () {
  return function different (value) { return value + 1 }
}

const first = makeSameClosure()
const second = makeSameClosure()
const different = makeDifferentClosure()

function call (fn, value) { return fn(value) }

; %PrepareFunctionForOptimization(first)
first(1)
; %OptimizeFunctionOnNextCall(first)
first(1)

; %PrepareFunctionForOptimization(call)
for (let i = 0; i < 100; i++) call(i % 2 ? first : second, 1)
; %OptimizeFunctionOnNextCall(call)
call(first, 1)
call(different, 1)
