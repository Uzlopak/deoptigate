'use strict'

const Module = require('module')
const path = require('path')
const test = require('tape')

const findLogPath = path.join(__dirname, '../bin/deoptigate.find-log.js')
const generateReportPath = path.join(__dirname, '../bin/deoptigate.generate-report.js')

function loadFindLog(files) {
  const state = { providerOptions: null, root: null }
  const originalLoad = Module._load
  const originalLog = console.log
  const originalError = console.error
  Module._load = function (request, parent, isMain) {
    if (request === 'files-provider') {
      return {
        RETURN: 'RETURN',
        PROMPT: 'PROMPT',
        createFilesProvider(options) {
          state.providerOptions = options
          return {
            async fromDirectory(root) {
              state.root = root
              return files
            }
          }
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  delete require.cache[findLogPath]
  try {
    state.findLog = require(findLogPath)
  } finally {
    Module._load = originalLoad
  }
  state.logs = []
  state.errors = []
  console.log = (...args) => state.logs.push(args.join(' '))
  console.error = (...args) => state.errors.push(args.join(' '))
  state.restoreConsole = () => {
    console.log = originalLog
    console.error = originalError
  }
  return state
}

function loadGenerateReport() {
  const state = { pages: [], entries: [], errors: [], logCalls: [] }
  const originalLoad = Module._load
  const originalLog = console.log
  const originalError = console.error
  Module._load = function (request, parent, isMain) {
    if (request === '../deoptigate.log') {
      return {
        async logToJSON(file, options) {
          state.logCalls.push([ file, options ])
          return '{"files":[]}'
        }
      }
    }
    if (request === '../app/lib/create-page') {
      return () => '<html>fake page</html>'
    }
    if (request === '../app/lib/save-parts') {
      return {
        savePage(html) {
          state.pages.push(html)
          return '/tmp/fake-deoptigate/index.html'
        },
        saveEntry(json) {
          state.entries.push(json)
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  delete require.cache[generateReportPath]
  try {
    state.generateReport = require(generateReportPath)
  } finally {
    Module._load = originalLoad
  }
  console.log = () => {}
  console.error = (...args) => state.errors.push(args.join(' '))
  state.restore = () => {
    console.log = originalLog
    console.error = originalError
  }
  return state
}

test('find-log reports when no V8 logs are present', async (t) => {
  const state = loadFindLog([])
  try {
    const result = await state.findLog('deoptigate')
    t.equal(result, undefined, 'returns no path when the provider finds no files')
    t.equal(state.errors.length, 3, 'prints all three recovery messages')
    t.ok(state.errors[1].includes('Unable to find a v8.log'), 'explains which log file names are accepted')
    t.ok(state.providerOptions.regex.test('v8.log'), 'accepts v8.log')
    t.ok(state.providerOptions.regex.test('isolate-123-v8.log'), 'accepts isolate v8 log names')
    t.notOk(state.providerOptions.regex.test('other.log'), 'rejects unrelated log names')
    t.equal(state.root, process.cwd(), 'searches the current directory')
  } finally {
    state.restoreConsole()
  }
  t.end()
})

test('find-log returns the first provider result', async (t) => {
  const state = loadFindLog([
    { fullPath: '/logs/v8.log' },
    { fullPath: '/logs/isolate-other-v8.log' }
  ])
  try {
    const result = await state.findLog('deoptigate')
    t.equal(result, '/logs/v8.log', 'returns the first matching path')
    t.equal(state.errors.length, 0, 'does not report an error when logs exist')
    t.ok(state.logs[0].includes('/logs/v8.log'), 'reports the selected log path')
    t.equal(state.providerOptions.single, 'RETURN', 'returns a single matching log directly')
    t.equal(state.providerOptions.multi, 'PROMPT', 'prompts when multiple logs exist')
    t.equal(state.providerOptions.choiceAll, false, 'does not offer a choice for all logs')
    t.end()
  } finally {
    state.restoreConsole()
  }
})

test('generate-report saves output and reports the generated page path', async (t) => {
  const state = loadGenerateReport()
  try {
    await state.generateReport('/logs/v8.log', 'deoptigate')
    t.deepEqual(state.logCalls, [ [ '/logs/v8.log', { root: process.cwd() } ] ], 'parses the requested log in the current root')
    t.deepEqual(state.pages, [ '<html>fake page</html>' ], 'saves the generated HTML page')
    t.deepEqual(state.entries, [ '{"files":[]}' ], 'saves parsed render data')
    t.ok(state.errors[0].includes('Successfully generated deoptimization visualization'), 'reports successful generation')
    t.ok(state.errors[0].includes('/tmp/fake-deoptigate/index.html'), 'prints the generated page path')
    t.notOk(state.errors[0].includes('Opening now in your default browser'), 'does not claim to open a browser')
  } finally {
    state.restore()
  }
  t.end()
})
