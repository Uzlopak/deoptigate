function f(shouldDeopt) {
  if (shouldDeopt) %DeoptimizeNow()
  return 1
}

for (let i = 0; i < 10000; i++) f(false);
%OptimizeFunctionOnNextCall(f); f(false);
f(true);
