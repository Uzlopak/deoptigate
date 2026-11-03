'use strict'

function add (left, right) {
  return left + right
}

// Warm up `add` with integers so V8 can optimize it for that input shape.
for (let i = 0; i < 100000; i++) add(i, i)

// Changing the input type forces V8 to deoptimize the optimized function.
add('demo', 1)
