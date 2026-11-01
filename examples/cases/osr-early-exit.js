'use strict'

// Verified on Node 24.21.0 with --no-concurrent-recompilation. The inner
// loop reaches OSR; returning to the outer loop crosses back over the OSR
// entry point and deoptimizes with `exit from OSR'd inner loop`.
function nested (outer, inner) {
  let total = 0
  for (let i = 0; i < outer; i++) {
    for (let j = 0; j < inner; j++) total += j & 1
  }
  return total
}

for (let i = 0; i < 50; i++) nested(2, 2)
console.log(nested(20, 500000))
