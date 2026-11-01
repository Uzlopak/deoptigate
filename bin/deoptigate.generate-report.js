'use strict'

const { logToJSON } = require('../deoptigate.log')

const createPage = require('../app/lib/create-page')
const { savePage, saveEntry } = require('../app/lib/save-parts')

async function generateReport(v8log, head) {
    const json = await logToJSON(v8log, { root: process.cwd() })
    const html = createPage()
    const indexHtmlFile = savePage(html)
    saveEntry(json)

      console.error(`
${head}: Successfully generated deoptimization visualization  🎉 ⚡ ✨
  Saved to:
    ${indexHtmlFile}
    `)
}

module.exports = generateReport
