function C(x) { this.x = 0; this.x = x; }
const a = new C(1.5);
const c = new C(2.5);
function f(o) { return o.x; }
for (let i = 0; i < 10000; i++) f(a);
%OptimizeFunctionOnNextCall(f); f(a);
c.x = {};
f(a);
