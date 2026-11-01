let run
;(function () {
  class Temporary { constructor () { this.x = 1 } }
  function candidate (value) { return value.x }
  run = candidate
  for (let i = 0; i < 10_000; i++) run(new Temporary())
  ; %OptimizeFunctionOnNextCall(run)
  run(new Temporary())
})()
gc()
gc()
