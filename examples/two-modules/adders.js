'use strict'

const {
    Object1
  , Object2
  , Object3
  , Object4
  , Object5
  , Object6
  , Object7
  , Object8
} = require('./objects')

// We access this object in all the functions as otherwise
// v8 will just inline them since they are so short
const preventInlining = {
  flag: false
}

/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addSmis(a, b) {
  if (preventInlining.flag) return a - b
  return a + b
}

/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addNumbers(a, b) {
  if (preventInlining.flag) return a - b
  return a + b
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {string | number}
 */
function addStrings(a, b) {
  if (preventInlining.flag) return Number(a) - Number(b)
  return a + b
}

/** @typedef {{x: number, y: number}} CoordinateObject */
/**
 * @param {number | string | CoordinateObject} a
 * @param {number | string=} b
 * @returns {number | string}
 */
function addAny(a, b) {
  if (preventInlining.flag) return Number(a) - Number(b)
  // passed one object?
  if (b == null) {
    if (typeof a !== 'object') return Number.NaN
    return a.x + a.y
  }
  if (typeof a === 'string' || typeof b === 'string') return `${a}${b}`
  if (typeof a === 'object') return `${a}${b}`
  return a + b
}

const ITER = 1E3

/** @type {(number | string)[]} */
var results = []

/**
 * @param {number | string} r
 * @returns {void}
 */
function processResult(r) {
  // will never happen
  if (r === -1) preventInlining.flag = true
  results.push(r)
  // prevent exhausting memory
  if (results.length > 1E5) results = []
}

for (let i = 0; i < ITER; i++) {
  for (let j = ITER; j > 0; j--) {
    processResult(addSmis(i, j))
    processResult(addNumbers(i, j))
    processResult(addNumbers(i * 0.2, j * 0.2))
    processResult(addStrings(`${i}`, `${j}`))
    // Just passing Smis for now
    processResult(addAny(i, j))
  }
}

for (let i = 0; i < ITER; i++) {
  for (let j = ITER; j > 0; j--) {
    // Adding Doubles
    processResult(addAny(i * 0.2, j * 0.2))
  }
}

for (let i = 0; i < ITER; i++) {
  for (let j = ITER; j > 0; j--) {
    // Adding Strings
    processResult(addAny(`${i}`, `${j}`))
  }
}

/**
 * @param {new (x: number, y: number) => { x: number, y: number }} SomeObject
 * @returns {void}
 */
function addObjects(SomeObject) {
  for (let i = 0; i < ITER; i++) {
    for (let j = ITER; j > 0; j--) {
      processResult(addAny(new SomeObject(i, j)))
    }
  }
}
addObjects(Object1)
addObjects(Object2)
addObjects(Object3)
addObjects(Object4)
addObjects(Object5)
addObjects(Object6)
addObjects(Object7)
addObjects(Object8)

/**
 * @param {...(number | string)} args
 * @returns {void}
 */
function log(...args) {
  console.log.apply(console, args)
}

log(results.length)
