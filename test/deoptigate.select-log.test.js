'use strict'

const Module = require('module')
const path = require('path')
const { EventEmitter } = require('events')
const { test } = require('node:test')

const selectLogPath = path.join(__dirname, '../bin/deoptigate.select-log.js')
const generateReportPath = path.join(__dirname, '../bin/deoptigate.generate-report.js')

/** @typedef {{ fullPath: string, readable?: boolean, isFile?: boolean }} LogFileFixture */
/** @typedef {{ root: string | null, answers: string[], questions: string[], closeCount: number, selectLog: (head: string) => Promise<string | undefined>, logs: string[], errors: string[], restoreConsole: () => void }} SelectLogState */
/** @typedef {{ pages: string[], entries: string[], errors: string[], logCalls: [string, { root: string }][], generateReport: (file: string, head: string) => Promise<void>, restore: () => void }} GenerateReportState */
/**
 * `Module._load` is an undocumented CommonJS hook, so describe the narrow
 * signature used by these dependency mocks locally.
 * @typedef {(request: string, parent: NodeJS.Module | undefined, isMain: boolean) => unknown} LoadModule
 * @typedef {typeof Module & {_load: LoadModule}} ModuleWithLoad
 * @typedef {{constants: {R_OK: number}, promises: {readdir(root: string): Promise<string[]>, access(filePath: string): Promise<void>, stat(filePath: string): Promise<{isFile(): boolean}>}}} FakeFileSystem
 */

/**
 * Load the log selector with mocked filesystem and readline dependencies.
 * @param {LogFileFixture[]} files
 * @param {string[]} [answers]
 * @returns {SelectLogState}
 */
function loadSelectLog(files, answers = [ '1' ]) {
  /** @type {SelectLogState} */
  const state = {
    root: null,
    answers,
    questions: [],
    closeCount: 0,
    selectLog: async () => undefined,
    logs: [],
    errors: [],
    restoreConsole: () => {}
  }
  const moduleLoader = /** @type {ModuleWithLoad} */ (/** @type {unknown} */ (Module))
  const originalLoad = moduleLoader._load
  const originalLog = console.log
  const originalError = console.error
  /** @type {FakeFileSystem} */
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
          const err = Object.assign(new Error('not readable'), { code: 'EACCES' })
          throw err
        }
      },
      async stat(filePath) {
        const file = files.find(candidate => candidate.fullPath === filePath)
        if (file == null) throw new Error(`missing fixture for ${filePath}`)
        return { isFile: () => file.isFile !== false }
      }
    }
  }
  moduleLoader._load = function (request, parent, isMain) {
    if (request === 'fs') return fakeFs
    if (request === 'readline') {
      return {
        createInterface() {
          const prompt = /**
           * @type {EventEmitter & {
           *   question(prompt: string, callback: (answer: string) => void): void,
           *   close(): void
           * }}
           */ (new EventEmitter())
          prompt.question = function (question, callback) {
            state.questions.push(question)
            process.nextTick(() => {
              const answer = state.answers.shift()
              if (answer == null) prompt.emit('close')
              else callback(answer)
            })
          }
          prompt.close = function () {
            state.closeCount++
            prompt.emit('close')
          }
          return prompt
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  delete require.cache[selectLogPath]
  try {
    state.selectLog = require(selectLogPath)
  } finally {
  moduleLoader._load = originalLoad
  }
  console.log = (...args) => state.logs.push(args.join(' '))
  console.error = (...args) => state.errors.push(args.join(' '))
  state.restoreConsole = () => {
    console.log = originalLog
    console.error = originalError
  }
  return state
}

/** @returns {GenerateReportState} */
function loadGenerateReport() {
  /** @type {GenerateReportState} */
  const state = {
    pages: [],
    entries: [],
    errors: [],
    logCalls: [],
    generateReport: async () => {},
    restore: () => {}
  }
  const moduleLoader = /** @type {ModuleWithLoad} */ (/** @type {unknown} */ (Module))
  const originalLoad = moduleLoader._load
  const originalLog = console.log
  const originalError = console.error
  moduleLoader._load = function (request, parent, isMain) {
    if (request === '../deoptigate.log') {
      return {
        /**
         * @param {string} file
         * @param {{root: string}} options
         * @returns {Promise<string>}
         */
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
        /**
         * @param {string} html
         * @returns {string}
         */
        savePage(html) {
          state.pages.push(html)
          return '/tmp/fake-deoptigate/index.html'
        },
        /**
         * @param {string} json
         * @returns {void}
         */
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
  moduleLoader._load = originalLoad
  }
  console.log = () => {}
  console.error = (...args) => state.errors.push(args.join(' '))
  state.restore = () => {
    console.log = originalLog
    console.error = originalError
  }
  return state
}

test('select-log reports when no V8 logs are present', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  const state = loadSelectLog([])
  try {
    const result = await state.selectLog('deoptigate')
    t.assert.equal(result, undefined, 'returns no path when the provider finds no files')
    t.assert.equal(state.errors.length, 3, 'prints all three recovery messages')
    t.assert.ok(state.errors[1].includes('Unable to find a v8.log'), 'explains which log file names are accepted')
    t.assert.equal(state.root, process.cwd(), 'searches the current directory')
  } finally {
    state.restoreConsole()
  }
})

test('select-log prompts when multiple logs are present', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(7)
  const state = loadSelectLog([
    { fullPath: path.join(process.cwd(), 'v8.log') },
    { fullPath: path.join(process.cwd(), 'isolate-other-v8.log') }
  ], [ '2' ])
  try {
    const result = await state.selectLog('deoptigate')
    t.assert.equal(result, path.join(process.cwd(), 'isolate-other-v8.log'), 'returns the selected path')
    t.assert.equal(state.errors.length, 0, 'does not report an error when logs exist')
    t.assert.ok(state.logs.some(log => log.includes(path.join(process.cwd(), 'isolate-other-v8.log'))), 'reports the selected log path')
    t.assert.ok(state.logs.some(log => log.includes('1:  v8.log')), 'lists the first matching log')
    t.assert.ok(state.logs.some(log => log.includes('2:  isolate-other-v8.log')), 'lists the second matching log')
    t.assert.deepEqual(state.questions, [ '\n\nYour choice: ' ], 'prompts for a selection')
    t.assert.equal(state.closeCount, 1, 'closes the prompt after selection')
    t.diagnostic('Simulated input: 2')
    state.logs.forEach(line => t.diagnostic(line))
    t.diagnostic(state.questions.join(''))
  } finally {
    state.restoreConsole()
  }
})

test('select-log rejects when input closes before a choice is entered', async (
  /** @type {import('node:test').TestContext} */ t
) => {
  const state = loadSelectLog([
    { fullPath: path.join(process.cwd(), 'v8.log') },
    { fullPath: path.join(process.cwd(), 'isolate-other-v8.log') }
  ], [])

  try {
    await t.assert.rejects(
      state.selectLog('deoptigate'),
      /log selection closed before a choice was entered/,
      'does not treat stdin EOF as a successful selection'
    )
  } finally {
    state.restoreConsole()
  }
})

test('select-log skips unreadable files, directories, and unrelated names', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const state = loadSelectLog([
    { fullPath: path.join(process.cwd(), 'v8.log'), readable: false },
    { fullPath: path.join(process.cwd(), 'isolate-dir-v8.log'), isFile: false },
    { fullPath: path.join(process.cwd(), 'other.log') },
    { fullPath: path.join(process.cwd(), 'isolate-123-v8.log') }
  ])
  try {
    const result = await state.selectLog('deoptigate')
    t.assert.equal(result, path.join(process.cwd(), 'isolate-123-v8.log'), 'returns the only readable matching file')
    t.assert.equal(state.questions.length, 0, 'does not prompt for one matching file')
  } finally {
    state.restoreConsole()
  }
})

test('select-log reports invalid choices and accepts a later valid choice', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  const state = loadSelectLog([
    { fullPath: path.join(process.cwd(), 'v8.log') },
    { fullPath: path.join(process.cwd(), 'isolate-other-v8.log') }
  ], [ '', 'not a number', '3', '2' ])
  try {
    const result = await state.selectLog('deoptigate')
    t.assert.equal(result, path.join(process.cwd(), 'isolate-other-v8.log'), 'returns the selected second path')
    t.assert.equal(state.questions.length, 4, 'repeats the prompt until a valid selection is entered')
    t.assert.equal(state.errors.length, 3, 'reports each invalid choice')
    t.assert.equal(state.closeCount, 4, 'closes each prompt after receiving an answer')
  } finally {
    state.restoreConsole()
  }
})

test('generate-report saves output and reports the generated page path', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(6)
  const state = loadGenerateReport()
  try {
    await state.generateReport('/logs/v8.log', 'deoptigate')
    t.assert.deepEqual(state.logCalls, [ [ '/logs/v8.log', { root: process.cwd() } ] ], 'parses the requested log in the current root')
    t.assert.deepEqual(state.pages, [ '<html>fake page</html>' ], 'saves the generated HTML page')
    t.assert.deepEqual(state.entries, [ '{"files":[]}' ], 'saves parsed render data')
    t.assert.ok(state.errors[0].includes('Successfully generated deoptimization visualization'), 'reports successful generation')
    t.assert.ok(state.errors[0].includes('/tmp/fake-deoptigate/index.html'), 'prints the generated page path')
    t.assert.ok(!state.errors[0].includes('Opening now in your default browser'), 'does not claim to open a browser')
  } finally {
    state.restore()
  }
})
