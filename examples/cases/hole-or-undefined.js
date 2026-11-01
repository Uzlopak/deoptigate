// Candidate based on V8's array-sort-inline.js test. The inlined sort should
// deopt when it finds undefined in a packed array; some Node builds do not
// inline Array.prototype.sort, so this may not produce HoleOrUndefined.
(function () {
  let sawUndefinedInComparator = false

  function compare(a, b) {
    if (a === undefined || b === undefined) sawUndefinedInComparator = true
    return a < b ? -1 : a > b ? 1 : 0
  }

  function sortSmall(array) {
    array.sort(compare)
    return array
  }

  ; %PrepareFunctionForOptimization(compare)
  ; %PrepareFunctionForOptimization(sortSmall)
  sortSmall(['c', 'x', 'a', 'b'])
  sortSmall(['c', 'x', 'a', 'b'])
  ; %OptimizeMaglevOnNextCall(sortSmall)
  ; %OptimizeMaglevOnNextCall(compare)
  sortSmall(['c', 'x', 'a', 'b'])

  // The generic builtin sorts undefined to the end without calling compare.
  const result = sortSmall(['c', undefined, 'a', 'b'])
  if (result[3] !== undefined || sawUndefinedInComparator) {
    throw new Error('Array.prototype.sort semantics changed')
  }
})()
