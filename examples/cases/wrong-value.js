require('node:vm').runInThisContext(`
let value = { id: 1 }

function replaceValue (next) {
  value = next
  return value
}

for (let i = 0; i < 100_000; i++) replaceValue(value)
replaceValue({ id: 2 })
`)
