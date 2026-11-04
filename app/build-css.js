'use strict'

const fs = require('node:fs/promises')
const postcss = require('postcss')
/** @type {() => import('postcss').Plugin} */
// @ts-expect-error postcss-import has no declaration file; the plugin's local return type is specified above.
const postcssImport = require('postcss-import')
/** @type {import('postcss').PluginCreator<import('@fullhuman/postcss-purgecss').UserDefinedOptions>} */
const purgecss = /** @type {import('postcss').PluginCreator<import('@fullhuman/postcss-purgecss').UserDefinedOptions>} */ (
  /** @type {unknown} */ (require('@fullhuman/postcss-purgecss'))
)
const cssnano = require('cssnano')

const SOURCE = 'main.css'
const SCRIPT = 'build/deoptigate.js'
const OUTPUT = 'build/deoptigate.css'

/**
 * Extract utility class names from HTML or bundled JavaScript content.
 * @param {string} content
 * @returns {string[]}
 */
function extractClasses (content) {
  return content.match(/[\w-/:]+(?<!:)/g) || []
}

/** Build and write the purged, minified application stylesheet. @returns {Promise<void>} */
async function buildCss () {
  const css = await fs.readFile(SOURCE, 'utf8')
  const imported = await postcss([postcssImport()]).process(css, { from: SOURCE })
  const beforePurge = Buffer.byteLength(imported.css)
  const purged = await postcss([
    purgecss({
      content: [
        SCRIPT,
        {
          raw: '<!doctype html><html><head></head><body></body></html>',
          extension: 'html'
        }
      ],
      defaultExtractor: extractClasses
    })
  ]).process(imported.css, { from: SOURCE })
  const afterPurge = Buffer.byteLength(purged.css)
  const result = await postcss([cssnano()]).process(purged.css, { from: SOURCE, to: OUTPUT })

  await fs.writeFile(OUTPUT, result.css)

  const saved = beforePurge - afterPurge
  const percent = beforePurge === 0 ? 0 : Math.round((saved / beforePurge) * 1000) / 10
  console.log(`PurgeCSS reduced CSS by ${percent}% (${beforePurge} -> ${afterPurge} bytes)`)
  console.log(`Minified CSS bundle: ${Buffer.byteLength(result.css)} bytes`)
}

buildCss().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
