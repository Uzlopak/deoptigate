function store(o) { o.x = 1; return o.x; }
for (let i = 0; i < 10000; i++) store({});
%OptimizeFunctionOnNextCall(store); store({});
const c = {}; c.x = 1.5;
store({});
