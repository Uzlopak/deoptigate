globalThis.x = 'global'

function outer (callback) {
  const inner = function () { return x }
  callback(inner, false)
  eval('var x = "shadowed"')
  callback(inner, true)
}

outer((inner, afterEval) => {
  if (afterEval) {
    inner()
    return
  }

  for (let i = 0; i < 10_000; i++) inner()
  ; %OptimizeFunctionOnNextCall(inner)
  inner()
})
