'use strict'

const Module = require('module')
const path = require('path')
const test = require('tape')

const selectLogPath = path.join(__dirname, '../bin/deoptigate.select-log.js')
const generateReportPath = path.join(__dirname, '../bin/deoptigate.generate-report.js')

function loadSelectLog(files, answers = [ '1' ]) {
  const state = { root: null, answers, questions: [], closeCount: 0 }
  const originalLoad = Module._load
  const originalLog = console.log
  const originalError = console.error
  const fakeFs = {
    constants: { R_OK: 4 },
    promises: {
      async readdir(root) {
        state.root = root
        return files.map(file => path.basename(file.fullPath))
      },
      async access(filePath) {
        const file = files.find(candidate => candidate.fullPath === filePath)
        if (file == null || file.readable === false) {
          const err = new Error('not readable')
          err.code = 'EACCES'
          throw err
        }
      },
      async stat(filePath) {
        const file = files.find(candidate => candidate.fullPath === filePath)
        return { isFile: () => file.isFile !== false }
      }
    }
  }
  Module._load = function (request, parent, isMain) {
    if (request === 'fs') return fakeFs
    if (request === 'readline') {
      return {
        createInterface() {
          return {
            question(prompt, callback) {
              state.questions.push(prompt)
              process.nextTick(() => callback(state.answers.shift()))
            },
            close() {
              state.closeCount++
            }
          }
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  delete require.cache[selectLogPath]
  try {
    state.selectLog = require(selectLogPath)
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

test('select-log reports when no V8 logs are present', async (t) => {
  const state = loadSelectLog([])
  try {
    const result = await state.selectLog('deoptigate')
    t.equal(result, undefined, 'returns no path when the provider finds no files')
    t.equal(state.errors.length, 3, 'prints all three recovery messages')
    t.ok(state.errors[1].includes('Unable to find a v8.log'), 'explains which log file names are accepted')
    t.equal(state.root, process.cwd(), 'searches the current directory')
  } finally {
    state.restoreConsole()
  }
  t.end()
})

test('select-log prompts when multiple logs are present', async (t) => {
  const state = loadSelectLog([
    { fullPath: path.join(process.cwd(), 'v8.log') },
    { fullPath: path.join(process.cwd(), 'isolate-other-v8.log') }
  ], [ '2' ])
  try {
    const result = await state.selectLog('deoptigate')
    t.equal(result, path.join(process.cwd(), 'isolate-other-v8.log'), 'returns the selected path')
    t.equal(state.errors.length, 0, 'does not report an error when logs exist')
    t.ok(state.logs.some(log => log.includes(path.join(process.cwd(), 'isolate-other-v8.log'))), 'reports the selected log path')
    t.ok(state.logs.some(log => log.includes('1:  v8.log')), 'lists the first matching log')
    t.ok(state.logs.some(log => log.includes('2:  isolate-other-v8.log')), 'lists the second matching log')
    t.deepEqual(state.questions, [ '\n\nYour choice: ' ], 'prompts for a selection')
    t.equal(state.closeCount, 1, 'closes the prompt after selection')
    t.comment('Simulated input: 2')
    state.logs.forEach(line => t.comment(line))
    t.comment(state.questions.join(''))
    t.end()
  } finally {
    state.restoreConsole()
  }
})

test('select-log skips unreadable files, directories, and unrelated names', async (t) => {
  const state = loadSelectLog([
    { fullPath: path.join(process.cwd(), 'v8.log'), readable: false },
    { fullPath: path.join(process.cwd(), 'isolate-dir-v8.log'), isFile: false },
    { fullPath: path.join(process.cwd(), 'other.log') },
    { fullPath: path.join(process.cwd(), 'isolate-123-v8.log') }
  ])
  try {
    const result = await state.selectLog('deoptigate')
    t.equal(result, path.join(process.cwd(), 'isolate-123-v8.log'), 'returns the only readable matching file')
    t.equal(state.questions.length, 0, 'does not prompt for one matching file')
  } finally {
    state.restoreConsole()
  }
  t.end()
})

test('select-log reports invalid choices and accepts a later valid choice', async (t) => {
  const state = loadSelectLog([
    { fullPath: path.join(process.cwd(), 'v8.log') },
    { fullPath: path.join(process.cwd(), 'isolate-other-v8.log') }
  ], [ 'not a number', '3', '2' ])
  try {
    const result = await state.selectLog('deoptigate')
    t.equal(result, path.join(process.cwd(), 'isolate-other-v8.log'), 'returns the selected second path')
    t.equal(state.questions.length, 3, 'repeats the prompt until a valid selection is entered')
    t.equal(state.errors.length, 2, 'reports each invalid choice')
    t.equal(state.closeCount, 3, 'closes each prompt after receiving an answer')
  } finally {
    state.restoreConsole()
  }
  t.end()
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
