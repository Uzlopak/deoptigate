// Make the original constructor map obsolete by changing x from Smi to
// double. The non-extensible instance cannot migrate to the replacement map.
function C () { this.x = 42 }

const stale = new C()
const normal = new C()
const peer = new C()
Object.preventExtensions(stale)

function markMigrationTarget (object) {
  return object.x
}

%PrepareFunctionForOptimization(markMigrationTarget)
for (let i = 0; i < 5; i++) markMigrationTarget(normal)
peer.x = 0.1
normal.x = normal.x
; %OptimizeFunctionOnNextCall(markMigrationTarget)
markMigrationTarget(normal)

function readTarget (object) {
  return object.x
}

%PrepareFunctionForOptimization(readTarget)
for (let i = 0; i < 10; i++) readTarget(peer)
; %OptimizeFunctionOnNextCall(readTarget)
readTarget(peer)
readTarget(stale)
