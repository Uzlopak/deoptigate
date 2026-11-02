'use strict'

const fs = require('fs')
const path = require('path')
const mainTemplate = require('@clinic/clinic-common/templates/main')

const clinicCommonRoot = path.dirname(require.resolve('@clinic/clinic-common'))
const styles = fs.readFileSync(path.join(clinicCommonRoot, 'styles/styles.css'), 'utf8')
const pageStyles = fs.readFileSync(path.join(__dirname, '../visualizer/style.css'), 'utf8')
const script = fs.readFileSync(require.resolve('../visualizer/main.js'), 'utf8')
const faviconLogo = fs.readFileSync(path.join(__dirname, '../visualizer/logo.svg'), 'utf8').trim()
const headerLogo = fs.readFileSync(path.join(__dirname, '../visualizer/logo-alt.svg'), 'utf8').trim()

function serializeData (data) {
  return JSON.stringify(data).replace(/[<\u2028\u2029]/g, char => {
    switch (char) {
      case '<': return '\\u003c'
      case '\u2028': return '\\u2028'
      case '\u2029': return '\\u2029'
    }
  })
}

function createClinicPage (data, version, elapsedTime) {
  return mainTemplate({
    favicon: `data:image/svg+xml;base64,${Buffer.from(faviconLogo).toString('base64')}`,
    title: 'Clinic Deoptigate',
    styles: `${styles}\n${pageStyles}`,
    script,
    data: serializeData(data),
    headerLogoUrl: 'https://clinicjs.org/deoptigate/',
    headerLogoTitle: 'Clinic Deoptigate on Clinicjs.org',
    headerLogo,
    headerText: 'Deoptigate',
    toolVersion: version,
    elapsedTime,
    body: `<main class="clinic-deoptigate">
      <div class="deoptigate-toolbar">
        <div><h1>Performance overview</h1><p>V8 optimizations, deoptimizations and inline cache changes</p></div>
        <div class="deoptigate-filters">
          <fieldset class="deoptigate-severity-filter">
            <legend>Severity</legend>
            <div id="deoptigate-severity" class="deoptigate-severity-options" role="group" aria-label="Filter by severity">
              <button type="button" data-severity="1" aria-pressed="true" title="Severity 1">Low</button>
              <button type="button" data-severity="2" aria-pressed="true" title="Severity 2">Medium</button>
              <button type="button" data-severity="3" aria-pressed="true" title="Severity 3">High</button>
            </div>
          </fieldset>
          <input id="deoptigate-search" class="deoptigate-search" type="search" placeholder="Filter source files" aria-label="Filter source files">
        </div>
      </div>
      <div class="deoptigate-workspace" id="deoptigate-workspace">
        <nav class="deoptigate-files" id="deoptigate-files" aria-label="Source files"></nav>
        <section class="deoptigate-details" id="deoptigate-details"></section>
      </div>
    </main>`
  })
}

module.exports = createClinicPage
