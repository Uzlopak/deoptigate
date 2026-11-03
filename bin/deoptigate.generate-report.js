'use strict'

const { logToJSON } = require('../deoptigate.log')

const createPage = require('../app/lib/create-page')
const { savePage, saveEntry } = require('../app/lib/save-parts')

/**
 * Generate the browser report files for a V8 log.
 * @param {string} v8log Path to the V8 log file.
 * @param {string} head Display name used in the success message.
 * @returns {Promise<void>}
 */
async function generateReport(v8log, head) {
    const json = await logToJSON(v8log, { root: process.cwd() })
    const html = createPage(null)
    const indexHtmlFile = savePage(html)
    saveEntry(json)

      console.error(`
${head}: Successfully generated deoptimization visualization  🎉 ⚡ ✨
  Saved to:
    ${indexHtmlFile}
    `)
}

module.exports = generateReport
