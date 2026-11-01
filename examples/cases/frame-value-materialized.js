function inner (object) {
  return inner.arguments[0].x
}

function top () {
  return inner({ x: 1 })
}

for (let i = 0; i < 20_000; i++) top()
