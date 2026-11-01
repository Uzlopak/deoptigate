function truncateAfterFirst (value, index, array) {
  array.length = 1
}

function visit (array) { array.forEach(truncateAfterFirst) }

const warmArray = [1]
for (let i = 0; i < 1_000; i++) visit(warmArray)
; %OptimizeMaglevOnNextCall(visit)
visit(warmArray)
visit([1, 2, 3])
