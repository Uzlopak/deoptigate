globalThis.deoptigateWrongNameFirst = 1
globalThis.deoptigateWrongNameSecond = 2

function readGlobal (name) {
  return globalThis[name]
}

for (let i = 0; i < 1_000; i++) readGlobal('deoptigateWrongNameFirst')
%OptimizeFunctionOnNextCall(readGlobal)
readGlobal('deoptigateWrongNameFirst')
readGlobal('deoptigateWrongNameSecond')
