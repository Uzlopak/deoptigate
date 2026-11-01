const inspector = require('inspector');
const session = new inspector.Session();
session.connect();

let pauseCount = 0;
session.on('Debugger.paused', () => {
  pauseCount++;
  session.post(pauseCount === 1 ? 'Debugger.stepInto' : 'Debugger.resume');
});
session.post('Debugger.enable');

let step = false;
function inner(x) { return x + 1; }
function f(x) { if (step) debugger; return inner(x); }

for (let i = 0; i < 10000; i++) f(i);
%OptimizeFunctionOnNextCall(f); f(1);
step = true;
f(2);
