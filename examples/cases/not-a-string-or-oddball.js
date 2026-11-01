function compare (left, right) { return left === right }

%PrepareFunctionForOptimization(compare)
for (let i = 0; i < 500; i++) {
  compare('a', 'b')
  compare(undefined, 'a')
}
%OptimizeMaglevOnNextCall(compare)
compare('a', 'b')
compare(1, 2)
