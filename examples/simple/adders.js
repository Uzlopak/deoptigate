'use strict'

/* global print */

class Object1 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor (x, y) {
    this.x = x
    this.y = y
  }
}

class Object2 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor (x, y) {
    this.y = y
    this.x = x
  }
}

class Object3 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor (x, y) {
    this.hello = 'world'
    this.x = x
    this.y = y
  }
}

class Object4 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor (x, y) {
    this.x = x
    this.hello = 'world'
    this.y = y
  }
}

class Object5 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor (x, y) {
    this.x = x
    this.y = y
    this.hello = 'world'
  }
}

class Object6 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor (x, y) {
    this.hola = 'mundo'
    this.x = x
    this.y = y
    this.hello = 'world'
  }
}

class Object7 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor (x, y) {
    this.x = x
    this.hola = 'mundo'
    this.y = y
    this.hello = 'world'
  }
}

class Object8 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor (x, y) {
    this.x = x
    this.y = y
    this.hola = 'mundo'
    this.hello = 'world'
  }
}
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
function addSmis (a, b) {
  if (preventInlining.flag) return Number(a) - Number(b)
  return a + b
}

/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addNumbers (a, b) {
  if (preventInlining.flag) return Number(a) - Number(b)
  return a + b
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number | string}
 */
function addStrings (a, b) {
  if (preventInlining.flag) return Number(a) - Number(b)
  return a + b
}

/** @typedef {{x: number, y: number}} CoordinateObject */
/**
 * Exercise addition with primitive values and objects exposing x and y.
 * @param {number | string | CoordinateObject} a
 * @param {number | string} [b]
 * @returns {number | string}
 */
function addAny (a, b) {
  if (preventInlining.flag) return Number(a) - Number(b)
  // passed one object?
  if (b == null) return typeof a === 'object' ? a.x + a.y : Number.NaN
  if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b)
  return Number(a) + Number(b)
}

const ITER = 1E3

/** @type {Array<number | string>} */
let results = []

/**
 * @param {number | string} r
 * @returns {void}
 */
function processResult (r) {
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
 * Run the workload for a constructor producing a point-like object.
 * @param {new (x: number, y: number) => CoordinateObject} SomeObject
 * @returns {void}
 */
function addObjects (SomeObject) {
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

// make this work with d8 and Node.js
/**
 * Print all supplied values using the available runtime output function.
 * @this {unknown}
 * @param {...(string | number)} args
 */
function log (...args) {
  if (typeof print === 'function') {
    Reflect.apply(print, this, args)
  } else {
    console.log.apply(console, args)
  }
}

log(results.length)
