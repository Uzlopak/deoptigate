'use strict'

const module_ = require('module')
const path = require('path')
const { fileURLToPath } = require('url')

const esbuild = require('../../app/node_modules/esbuild')

const APP_DIRECTORY = path.join(__dirname, '../../app')
const JSX_FILES = new Set([ path.join(APP_DIRECTORY, 'main.js') ])
const COMPONENTS_DIRECTORY = path.join(APP_DIRECTORY, 'components') + path.sep
const INLINE_MAP_PREFIX = '//# sourceMappingURL=data:application/json;base64,'

/**
 * Map the start of the output to the first source line. Coverage otherwise
 * counts the lines above the first statement, like 'use strict', as uncovered.
 *
 * @param {string} code
 * @returns {string}
 */
function mapFileStart (code) {
  const mapStart = code.lastIndexOf(INLINE_MAP_PREFIX)
  const encoded = code.slice(mapStart + INLINE_MAP_PREFIX.length).trim()
  const map = JSON.parse(Buffer.from(encoded, 'base64').toString())
  map.mappings = `AAAA${map.mappings}`
  return code.slice(0, mapStart) + INLINE_MAP_PREFIX + Buffer.from(JSON.stringify(map)).toString('base64')
}

/** Let tests require the report's JSX modules, keeping coverage on the original lines. */
module_.registerHooks({
  load (url, context, nextLoad) {
    const result = nextLoad(url, context)
    if (!url.startsWith('file:')) return result
    const filename = fileURLToPath(url)
    if (!JSX_FILES.has(filename) && !filename.startsWith(COMPONENTS_DIRECTORY)) return result
    const { code } = esbuild.transformSync(String(result.source), {
      loader: 'jsx',
      jsxFactory: 'Preact.createElement',
      format: 'cjs',
      sourcefile: filename,
      sourcemap: 'inline'
    })
    return { ...result, source: mapFileStart(code) }
  }
})
