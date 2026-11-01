function addAndTruncate (value) { return value + 1 | 0 }
%PrepareFunctionForOptimization(addAndTruncate)
addAndTruncate(1231234567890)
addAndTruncate(1231234567890)
; %OptimizeFunctionOnNextCall(addAndTruncate)
addAndTruncate(1231234567890)
addAndTruncate(4503599627370496)
