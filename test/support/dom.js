'use strict'

// @ts-expect-error jsdom does not provide a declaration file; only its window is used here.
const { JSDOM } = require('jsdom')

/**
 * @typedef {HTMLElement & {
 *   findAll: (matches: (element: TestElement) => boolean) => TestElement[],
 *   byClass: (className: string) => TestElement[],
 *   byTag: (tagName: string) => TestElement[],
 *   link: (text: string) => TestElement
 * }} TestElement
 */

/**
 * Fire a bubbling event at a node.
 *
 * @param {Node} node
 * @param {string} type
 * @returns {{defaultPrevented: boolean, cancelBubble: boolean}}
 */
function fire (node, type) {
  const { Event } = /** @type {Window & typeof globalThis} */ (/** @type {unknown} */ (globalThis.window))
  const event = new Event(type, { bubbles: true, cancelable: true })
  node.dispatchEvent(event)
  return event
}

/**
 * Install a fresh DOM as globals, with element helpers for the tests.
 *
 * @param {{search?: string}} [options]
 * @returns {{body: TestElement, pushed: unknown[][], history: History, window: Window & typeof globalThis}}
 */
function installDom ({ search = '' } = {}) {
  const { window } = new JSDOM('<!doctype html><body></body>', { url: `http://report/index.html${search}` })
  const { document, history, location, HTMLElement } = window
  /** @type {unknown[][]} */
  const pushed = []
  const pushState = history.pushState.bind(history)
  history.pushState = (/** @type {Parameters<History['pushState']>} */ ...args) => {
    pushed.push(args)
    pushState(...args)
  }

  const helpers = /** @type {TestElement} */ (/** @type {unknown} */ (HTMLElement.prototype))
  helpers.findAll = function (matches) {
    return /** @type {TestElement[]} */ (Array.from(this.querySelectorAll('*'))).filter(matches)
  }
  helpers.byClass = function (className) {
    return /** @type {TestElement[]} */ (Array.from(this.getElementsByClassName(className)))
  }
  helpers.byTag = function (tagName) {
    return /** @type {TestElement[]} */ (Array.from(this.getElementsByTagName(tagName)))
  }
  helpers.link = function (text) {
    const [ found ] = this.findAll(element => element.localName === 'a' && element.textContent === text)
    if (found == null) throw new Error(`no link named ${text}`)
    return found
  }

  Object.assign(globalThis, { document, window, history, HTMLElement })
  Object.defineProperty(globalThis, 'location', { value: location, configurable: true, writable: true })
  return { body: /** @type {TestElement} */ (document.body), pushed, history, window }
}

module.exports = { fire, installDom }
