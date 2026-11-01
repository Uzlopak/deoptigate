function unaryPlus(value) { return +value }
for (let i = 0; i < 1000; i++) unaryPlus(i + 0.5);
%OptimizeMaglevOnNextCall(unaryPlus);
unaryPlus(3.5);
unaryPlus("4");
