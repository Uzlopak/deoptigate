globalThis.x = 'global'

function outer(callback) {
  if (!callback) {
    eval('var x = "init";')
    return
  }

  const inner = function () { return x }
  callback(inner, false)
  eval('var x = "shadowed";')
  callback(inner, true)
}

outer(null)
outer((inner, afterEval) => {
  if (!afterEval) {
    for (let i = 0; i < 1000; i++) inner()
    ; %OptimizeFunctionOnNextCall(inner)
    inner()
  } else {
    inner()
  }
})
