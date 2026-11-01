function concat (left, right) { return left + right }
for (let i = 0; i < 5_000; i++) concat('a', 'b')
; %OptimizeFunctionOnNextCall(concat)
concat('a', 'b')
concat({}, 'b')
