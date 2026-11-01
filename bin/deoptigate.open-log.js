'use strict'

const open = require('opn')
const { logToJSON } = require('../deoptigate.log')

const createPage = require('../app/lib/create-page')
const { savePage, saveEntry } = require('../app/lib/save-parts')

async function openLog(v8log, head) {
    const json = await logToJSON(v8log, { root: process.cwd() })
    const html = createPage()
    const indexHtmlFile = savePage(html)
    saveEntry(json)

      console.error(`
${head}: Successfully generated deoptimization visualization  🎉 ⚡ ✨
  Saved to:
    ${indexHtmlFile}
${head}: Opening now in your default browser.
    `)
    if (process.env.DEOPTIGATE_OPEN_BROWSER !== '0') {
      open(indexHtmlFile, { wait: false })
    }
}

module.exports = openLog
