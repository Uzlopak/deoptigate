function C() { this.x = 1; }
function make() { return new C(); }
for (let i = 0; i < 10000; i++) make();
%OptimizeFunctionOnNextCall(make); make();
C.prototype = { y: 2 };
make();
