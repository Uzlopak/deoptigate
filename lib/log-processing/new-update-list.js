'use strict'

// Update lists live as long as the parse, so as `[]` literals V8 pretenures their
// allocation site, which throws away optimized code whenever a garbage collection
// changes that decision. A slice has no allocation site, and a template that has
// held an object keeps object elements, so pushing updates can't deoptimize either.
const EMPTY_OBJECT_LIST = /** @type {unknown[]} */ ([ {} ])
EMPTY_OBJECT_LIST.length = 0

/**
 * @template T
 * @returns {T[]} A new empty list.
 */
function newUpdateList() {
  return /** @type {T[]} */ (EMPTY_OBJECT_LIST.slice())
}

module.exports = newUpdateList
