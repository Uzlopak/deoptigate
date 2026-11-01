function readKey (object, key) { return object[key] }
const object = { x: 1, y: 2 }
for (let i = 0; i < 1_000; i++) readKey(object, 'x')
; %OptimizeMaglevOnNextCall(readKey)
readKey(object, 'x')
readKey(object, 'y')
