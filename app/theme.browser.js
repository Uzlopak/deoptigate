'use strict'

const escapeHtml = require('../lib/rendering/escape-html')
/** @type {{classes: Record<string, string>}} */
// @ts-expect-error Peacock does not provide a declaration file; its local API is typed here.
const peacock = require('peacock')
const { classes } = peacock

/** @typedef {{ line: number, column: number }} TokenLocation */
/** @typedef {{ loc: { end: TokenLocation | null } }} HighlightToken */
/** @typedef {{ tokens: HighlightToken[], tokenIndex: number }} TokenInfo */
/** @typedef {{ resolve(location: TokenLocation): { insertBefore: string, insertAfter: string } }} MarkerResolver */
/** @typedef {(text: string, info: TokenInfo) => string} ThemeRenderer */
/** @typedef {Record<string, ThemeRenderer | undefined> & {_default: ThemeRenderer | undefined}} ThemeRule */
/** @typedef {Record<string, ThemeRule | ThemeRenderer | undefined> & {_default: ThemeRenderer}} BrowserTheme */

/**
 * @param {string} s
 * @returns {string}
 */
function identity(s) { return s }

class ThemeBrowser {
  /** @param {MarkerResolver} markerResolver */
  constructor(markerResolver) {
    /** @type {MarkerResolver} */
    this._markerResolver = markerResolver
  }

  /**
   * @param {string | ((text: string) => string) | null | undefined} rendererOrClassName
   * @returns {ThemeRenderer}
   */
  _processToken(rendererOrClassName) {
    const className = typeof rendererOrClassName === 'string' ? rendererOrClassName : ''
    /**
     * @this {ThemeBrowser}
     * @param {string} s
     * @param {TokenInfo} info
     * @returns {string}
     */
    function mark(s, info) {
      // Peacock passes raw source text, which is inserted into the page as HTML
      const text = escapeHtml(s)
      const element = typeof rendererOrClassName === 'function'
        ? rendererOrClassName(text)
        : `<span class=${className}>${text}</span>`
      const { tokens, tokenIndex } = info
      const token = tokens[tokenIndex]
      const loc = token.loc.end
      if (loc == null) return element

      const { insertBefore, insertAfter } = this._markerResolver.resolve(loc)
      return insertBefore + element + insertAfter
    }
    return mark.bind(this)
  }

  /** @returns {BrowserTheme} */
  get theme() {
    const x = this._processToken.bind(this)
    return {
      'Boolean': {
        'true'   :  undefined
      , 'false'  :  undefined
      , _default :  x(classes['Keyword.Constant'])
      }

    , 'Identifier': {
        'Date': x(classes['Literal.Date'])
      , 'Error': x(classes['Generic.Error'])
      , _default: x(classes['Name.Other'])
      }

    , 'Null': {
        _default :  x(classes['Keyword.Constant'])
      }

    , 'Numeric': {
        _default: x(classes.Number)
      }

    , 'String': {
        _default: x(classes.String)
      }

      // Redeyed writes tokens of a type without a renderer to the page raw, so
      // every Esprima token type needs one here.
    , 'Template': {
        _default: x(classes.String)
      }

    , 'RegularExpression': {
        _default: x(classes.String)
      }

    , 'Keyword': {
        'break'       :  undefined

      , 'case'        :  undefined
      , 'catch'       :  undefined
      , 'class'       :  undefined
      , 'const'       :  undefined
      , 'continue'    :  undefined

      , 'debugger'    :  undefined
      , 'default'     :  undefined
      , 'delete'      :  undefined
      , 'do'          :  undefined

      , 'else'        :  undefined
      , 'enum'        :  undefined
      , 'export'      :  undefined
      , 'extends'     :  undefined

      , 'finally'     :  undefined
      , 'for'         :  undefined
      , 'function'    :  undefined

      , 'if'          :  undefined
      , 'implements'  :  undefined
      , 'import'      :  undefined
      , 'in'          :  undefined
      , 'instanceof'  :  undefined

      , 'new'         :  undefined

      , 'package'     :  undefined
      , 'private'     :  undefined
      , 'protected'   :  undefined
      , 'public'      :  undefined

      , 'return'      :  undefined

      , 'static'      :  undefined
      , 'super'       :  undefined
      , 'switch'      :  undefined

      , 'this'        :  undefined
      , 'throw'       :  undefined
      , 'try'         :  undefined
      , 'typeof'      :  undefined

      , 'var'         :  undefined
      , 'void'        :  undefined

      , 'while'       :  undefined
      , 'with'        :  undefined
      , 'yield'       :  undefined
      , _default      :  x(classes.Keyword)
    }
    , 'Punctuator': {
        ';': x(classes.Punctuation)
      , '.': x(classes.Punctuation)
      , ',': x(classes.Punctuation)

      , '{': x(classes.Punctuation)
      , '}': x(classes.Punctuation)
      , '(': x(classes.Punctuation)
      , ')': x(classes.Punctuation)
      , '[': x(classes.Punctuation)
      , ']': x(classes.Punctuation)

      , '<': undefined
      , '>': undefined
      , '+': undefined
      , '-': undefined
      , '*': undefined
      , '%': undefined
      , '&': undefined
      , '|': undefined
      , '^': undefined
      , '!': undefined
      , '~': undefined
      , '?': undefined
      , ':': undefined
      , '=': undefined

      , '<=': undefined
      , '>=': undefined
      , '==': undefined
      , '!=': undefined
      , '++': undefined
      , '--': undefined
      , '<<': undefined
      , '>>': undefined
      , '&&': undefined
      , '||': undefined
      , '+=': undefined
      , '-=': undefined
      , '*=': undefined
      , '%=': undefined
      , '&=': undefined
      , '|=': undefined
      , '^=': undefined
      , '/=': undefined
      , '=>': undefined
      , '**': undefined

      , '===': undefined
      , '!==': undefined
      , '>>>': undefined
      , '<<=': undefined
      , '>>=': undefined
      , '>>>=': undefined
      , '...': undefined
      , '**=': undefined

      , _default: x(classes.Operator)
    }
    , Line: {
        _default: x(classes['Comment.Single'])
      }

    , Block: {
        _default: x(classes.Comment)
      }

      // JSX
      , JSXAttribute: {
          _default: x(identity)
        }
      , JSXClosingElement: {
          _default: x(identity)
        }
      , JSXElement: {
          _default: x(identity)
        }
      , JSXEmptyExpression: {
          _default: x(identity)
        }
      , JSXExpressionContainer: {
          _default: x(identity)
        }
      , JSXIdentifier: {
          // many more identifies are possible, div, table, etc.
            className: x(classes['Name.Class'])
          , _default: x(classes['Name.Tag'])
        }
      , JSXMemberExpression: {
          _default: x(identity)
        }
      , JSXNamespacedName: {
          _default: x(identity)
        }
      , JSXOpeningElement: {
          _default: x(identity)
        }
      , JSXSpreadAttribute: {
          _default: x(identity)
        }
      , JSXText: {
          _default: x(identity)
        }

      , _default: x(identity)
    }
  }
}

module.exports = ThemeBrowser
