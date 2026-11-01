function isInstance(flag, object, constructor) {
  if (flag) return object instanceof constructor
  return false
}
for (let i = 0; i < 1000; i++) isInstance(false, [], Array)
; %OptimizeFunctionOnNextCall(isInstance)
isInstance(false, [], Array)
isInstance(true, [], Array)
