function make() { return [1, 2, 3]; }
for (let i = 0; i < 100; i++) make();
const a = make();
%OptimizeFunctionOnNextCall(make); make();
a.push('x');
make();
