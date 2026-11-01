// Candidate only: this follows the deprecated-map / integrity-transition
// sequence from V8's regress-932953 test. It has not produced an exact
// `instance migration failed` deopt on Node 24 or 26. The runtime probe below
// is a test intrinsic; a numeric result means V8 declined the migration, but
// does not by itself prove that the object's map was deprecated.
function C() {
  this.x = 42
  this.__defineGetter__('y', function () {})
  Object.preventExtensions(this)
  this.__defineSetter__('y', function () {})
}

const stale = new C()
const changed = new C()

function readX (object) {
  return object.x
}

for (let i = 0; i < 1000; i++) readX(stale)
; %OptimizeFunctionOnNextCall(readX)
readX(stale)

// Reconfigure a peer with the same constructor shape, then change a field
// representation. This attempts the map-update path while stale retains its
// original shape.
changed.x = 0.1
const migrationResult = %TryMigrateInstance(stale)
void migrationResult
readX(stale)
