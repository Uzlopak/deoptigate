function join (left, right) { return left + right }
for (let i = 0; i < 1_000; i++) join('a', 'b')
for (let i = 0; i < 1_000; i++) join('a', new String('b'))
; %OptimizeMaglevOnNextCall(join)
join('a', new String('b'))
join('a', 4)
