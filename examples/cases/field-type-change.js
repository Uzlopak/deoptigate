const o = { text: 'Hello' };
function A() { this.a = { text: 'foo' }; this.a = o; }
function readA(x) { return x.a; }
const a = new A();
for (let i = 0; i < 10000; i++) readA(a);
%OptimizeFunctionOnNextCall(readA); readA(a);
const c = new A();
c.a = [1];
readA(a);
