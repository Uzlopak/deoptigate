function getElement(array, index) {
  return array[index]
}

const values = [10, 20, 30]
for (let i = 0; i < 1000; i++) getElement(values, -0)
; %OptimizeFunctionOnNextCall(getElement)
getElement(values, -0)
getElement(values, NaN)
