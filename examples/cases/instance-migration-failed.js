// The stale instance takes an integrity-level transition, followed by an
// accessor transition. A peer stays on the shared extensible ancestor map and
// changes x to a double, deprecating that map and its descendants. Rebuilding
// stale's map then fails because its integrity/accessor transition sequence
// cannot be replayed.
const getter = function () {}
const setter = function () {}

function C () {
  this.x = 42
  this.__defineGetter__('y', getter)
}

const stale = new C()
Object.preventExtensions(stale)
stale.__defineSetter__('y', setter)

const normal = new C()
const peer = new C()

// Running optimized code with the old extensible map migrates normal and
// marks the new double-field map as a migration target.
function markMigrationTarget (object) {
  return object.x
}

%PrepareFunctionForOptimization(markMigrationTarget)
for (let i = 0; i < 5; i++) markMigrationTarget(normal)
peer.x = 0.1
// Some older V8 versions don't migrate through the optimized setup call's
// wrong-map deopt. Exercise the ordinary store IC as a migration fallback.
normal.x = normal.x
; %OptimizeFunctionOnNextCall(markMigrationTarget)
markMigrationTarget(normal)

// This optimized check accepts the migration target. Passing stale makes V8
// attempt to migrate its deprecated, non-extensible map and deopt on failure.
function readTarget (object) {
  return object.x
}

%PrepareFunctionForOptimization(readTarget)
for (let i = 0; i < 10; i++) readTarget(peer)
; %OptimizeFunctionOnNextCall(readTarget)
readTarget(peer)
readTarget(stale)
