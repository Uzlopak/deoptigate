function typeOf (value) { return typeof value }
for (let i = 0; i < 5_000; i++) typeOf(function () {})
; %OptimizeFunctionOnNextCall(typeOf)
typeOf(function () {})
typeOf({})
