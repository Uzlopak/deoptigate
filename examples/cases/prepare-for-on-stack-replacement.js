// A Maglev frame transitions to its compiled TurboFan OSR code.
let keepGoing = 1_000_000
let i

function loop () {
  let sum = i
  while (--i > 0 && !%CurrentFrameIsTurbofan() && --keepGoing) sum += i
  return sum
}

function runUntilMaglevThenTierUp () {
  while (!%ActiveTierIsMaglev(loop) && --keepGoing) {
    i = 5.2
    loop()
  }
  i = 66_666_666_666
  loop()
}

%NeverOptimizeFunction(runUntilMaglevThenTierUp)
runUntilMaglevThenTierUp()
