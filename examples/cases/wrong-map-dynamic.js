function readForInKeys (enumerator, receiver) {
  let sum = 0
  for (const key in enumerator) sum += receiver[key] || 0
  return sum
}

const source = { x: 1, y: 2 }
for (let i = 0; i < 1_000; i++) readForInKeys(source, source)
; %OptimizeMaglevOnNextCall(readForInKeys)
readForInKeys(source, source)
readForInKeys(source, { x: 1, y: 2, extra: 3 })
