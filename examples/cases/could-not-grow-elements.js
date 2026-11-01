function append(array, value) {
  return array.push(value)
}

const warm = [1, , 2]
for (let i = 0; i < 1000; i++) append(warm, i)
; %OptimizeFunctionOnNextCall(append)
append(warm, 1)

const sparse = [1, , 2]
sparse.length = 100000
append(sparse, 3)
