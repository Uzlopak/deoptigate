function addMaybeOddball(flag, value) {
  const input = flag ? value : null;
  return input + 1;
}
for (let i = 0; i < 1000; i++) {
  addMaybeOddball(true, 4);
  addMaybeOddball(false, 0);
}
%OptimizeMaglevOnNextCall(addMaybeOddball);
addMaybeOddball(true, 4);
addMaybeOddball(true, "x");
