'use strict'

/** Add two numeric operands.
 * @overload
 * @param {number} left
 * @param {number} right
 * @returns {number}
 */
/** Concatenate when either operand is a string, following JavaScript `+` semantics.
 * @overload
 * @param {number | string} left
 * @param {number | string} right
 * @returns {number | string} A number for two numeric inputs; otherwise a string.
 */
/**
 * @param {number | string} left
 * @param {number | string} right
 * @returns {number | string} Numeric sum or string concatenation.
 */
function add (left, right) {
  // TypeScript cannot express JavaScript's primitive `+` coercion for unions.
  // @ts-expect-error The mixed number/string case is the workload being tested.
  return left + right
}

// Warm up `add` with integers so V8 can optimize it for that input shape.
for (let i = 0; i < 100000; i++) add(i, i)

// Changing the input type forces V8 to deoptimize the optimized function.
add('demo', 1)
