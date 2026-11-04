'use strict'

const Module = require('module')
const path = require('path')
const { EventEmitter } = require('events')
const { test } = require('node:test')

const selectLogPath = path.join(__dirname, '../bin/deoptigate.select-log.js')
const generateReportPath = path.join(__dirname, '../bin/deoptigate.generate-report.js')

/** @typedef {{ fullPath: string, readable?: boolean, isFile?: boolean }} LogFileFixture */
/** @typedef {{ root: string | null, answers: string[], questions: string[], closeCount: number, selectLog: (head: string) => Promise<string | undefined>, logs: string[], errors: string[], restoreConsole: () => void }} SelectLogState */
/** @typedef {{ pages: string[], entries: string[], jsonFiles: string[], errors: string[], logCalls: [string, { root: string }][], generateReport: (file: string, head: string, format?: 'html' | 'json' | 'compact_json' | 'jsonl', fileNameFilter?: string, severityFilter?: (1 | 2 | 3)[], typeFilter?: ('opt' | 'deopt' | 'ic')[]) => Promise<void>, restore: () => void }} GenerateReportState */
/** @typedef {{fullPath: string, relativePath: string, src: string, ics: object[], deopts: object[], codes: object[]}} FakeReportFile */
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
 * @param {string[] | null} [pipedLines] Lines delivered with an answer, followed by end of input.
 * @returns {SelectLogState}
 */
function loadSelectLog(files, answers = [ '1' ], pipedLines = null) {
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
              else {
                callback(answer)
                if (pipedLines != null) {
                  for (const line of pipedLines) prompt.emit('line', line)
                  prompt.emit('close')
                }
              }
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

/**
 * @param {Map<string, FakeReportFile>} [report]
 * @returns {GenerateReportState}
 */
function loadGenerateReport(report = new Map([
  [ '/tmp/fake-deoptigate/app.js', {
    fullPath: '/tmp/fake-deoptigate/app.js',
    relativePath: 'app.js',
    src: 'function run () {}',
    ics: [],
    deopts: [],
    codes: []
  } ]
])) {
  /** @type {GenerateReportState} */
  const state = {
    pages: [],
    entries: [],
    jsonFiles: [],
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
        * @returns {Promise<Map<string, FakeReportFile>>}
         */
        async processLog(file, options) {
          state.logCalls.push([ file, options ])
          return report
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
         * @returns {string}
         */
        saveEntry(json) {
          state.entries.push(json)
          return '/tmp/fake-deoptigate/deoptigate.render-data.js'
        },
        /**
         * @param {string} json
         * @param {'json' | 'compact_json' | 'jsonl'} [format]
         * @returns {string}
         */
        saveJson(json, format) {
          state.jsonFiles.push(json)
          const filename = format === 'compact_json'
            ? 'deoptigate.compact.json'
            : format === 'jsonl'
              ? 'deoptigate.jsonl'
              : 'deoptigate.json'
          return `/tmp/fake-deoptigate/${filename}`
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
    t.assert.equal(state.closeCount, 1, 'closes the shared prompt after the valid answer')
  } finally {
    state.restoreConsole()
  }
})

test('select-log uses a choice piped together with an invalid one', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const state = loadSelectLog([
    { fullPath: path.join(process.cwd(), 'v8.log') },
    { fullPath: path.join(process.cwd(), 'isolate-other-v8.log') }
  ], [ 'invalid' ], [ '2' ])
  try {
    const result = await state.selectLog('deoptigate')
    t.assert.equal(result, path.join(process.cwd(), 'isolate-other-v8.log'), 'returns the piped choice')
    t.assert.equal(state.questions.length, 1, 'does not prompt for a line that already arrived')
  } finally {
    state.restoreConsole()
  }
})

test('select-log fails when input ends before a valid choice', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const state = loadSelectLog([
    { fullPath: path.join(process.cwd(), 'v8.log') },
    { fullPath: path.join(process.cwd(), 'isolate-other-v8.log') }
  ], [ 'invalid' ], [])
  try {
    await t.assert.rejects(state.selectLog('deoptigate'), /closed before a choice/)
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
    t.assert.equal(JSON.parse(state.entries[0])[0][0], '/tmp/fake-deoptigate/app.js', 'saves parsed render data')
    t.assert.ok(state.errors[0].includes('Successfully generated deoptimization visualization'), 'reports successful generation')
    t.assert.ok(state.errors[0].includes('/tmp/fake-deoptigate/index.html'), 'prints the generated page path')
    t.assert.ok(!state.errors[0].includes('Opening now in your default browser'), 'does not claim to open a browser')
  } finally {
    state.restore()
  }
})

test('generate-report writes standalone JSON when requested', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(6)
  const state = loadGenerateReport()
  try {
    await state.generateReport('/logs/v8.log', 'deoptigate', 'json')
    t.assert.deepEqual(state.logCalls, [ [ '/logs/v8.log', { root: process.cwd() } ] ], 'parses the requested log')
    t.assert.equal(JSON.parse(state.jsonFiles[0])[0][0], '/tmp/fake-deoptigate/app.js', 'saves the serialized report data')
    t.assert.deepEqual(state.pages, [], 'does not save an HTML page')
    t.assert.deepEqual(state.entries, [], 'does not save a browser script')
    t.assert.ok(state.errors[0].includes('Successfully generated deoptimization data'), 'reports JSON generation')
    t.assert.ok(state.errors[0].includes('/tmp/fake-deoptigate/deoptigate.json'), 'prints the JSON file path')
  } finally {
    state.restore()
  }
})

test('generate-report writes compact JSON when requested', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(6)
  const state = loadGenerateReport()
  try {
    await state.generateReport('/logs/v8.log', 'deoptigate', 'compact_json')
    t.assert.deepEqual(state.jsonFiles, [ '[["/tmp/fake-deoptigate/app.js",[],[],[]]]' ], 'saves the compact report data')
    t.assert.deepEqual(state.pages, [], 'does not save an HTML page')
    t.assert.deepEqual(state.entries, [], 'does not save a browser script')
    t.assert.ok(state.errors[0].includes('Successfully generated compact deoptimization data'), 'reports compact JSON generation')
    t.assert.ok(state.errors[0].includes('/tmp/fake-deoptigate/deoptigate.compact.json'), 'prints the compact JSON path')
    t.assert.ok(!state.errors[0].includes('/tmp/fake-deoptigate/index.html'), 'does not report an HTML output')
  } finally {
    state.restore()
  }
})

test('generate-report writes JSON Lines when requested', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(5)
  const state = loadGenerateReport()
  try {
    await state.generateReport('/logs/v8.log', 'deoptigate', 'jsonl')
    const line = state.jsonFiles[0]
    t.assert.equal(line.split('\n').length, 1, 'writes one record per source file')
    t.assert.equal(JSON.parse(line).file, '/tmp/fake-deoptigate/app.js', 'keeps the file identity')
    t.assert.deepEqual(state.pages, [], 'does not save an HTML page')
    t.assert.ok(state.errors[0].includes('Successfully generated deoptimization data as JSONL'), 'reports JSONL generation')
    t.assert.ok(state.errors[0].includes('/tmp/fake-deoptigate/deoptigate.jsonl'), 'prints the JSONL path')
  } finally {
    state.restore()
  }
})

test('generate-report filters files by filename or path substring', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  const report = new Map([
      [ '/tmp/project/src/keep.js', {
        fullPath: '/tmp/project/src/keep.js', relativePath: 'src/keep.js', src: '', ics: [], deopts: [], codes: []
      } ]
    , [ '/tmp/project/lib/skip.js', {
        fullPath: '/tmp/project/lib/skip.js', relativePath: 'lib/skip.js', src: '', ics: [], deopts: [], codes: []
      } ]
  ])
  const state = loadGenerateReport(report)
  try {
    await state.generateReport('/logs/v8.log', 'deoptigate', 'json', 'src/keep')
    const files = JSON.parse(state.jsonFiles[0])
    t.assert.equal(files.length, 1, 'keeps only matching files')
    t.assert.equal(files[0][0], '/tmp/project/src/keep.js', 'matches a path substring')
    await state.generateReport('/logs/v8.log', 'deoptigate', 'json', '/tmp/project/src/keep.js')
    t.assert.equal(JSON.parse(state.jsonFiles[1]).length, 1, 'matches an absolute file path')
  } finally {
    state.restore()
  }
})

test('generate-report filters updates by selected severities', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  const report = new Map([
    [ '/tmp/project/app.js', {
      fullPath: '/tmp/project/app.js', relativePath: 'app.js', src: '',
      ics: [{
        functionName: 'run', file: '/tmp/project/app.js', line: 1, column: 1,
        updates: [{ severity: 1 }, { severity: 2 }]
      }],
      deopts: [{
        functionName: 'run', file: '/tmp/project/app.js', line: 2, column: 1,
        updates: [{ severity: 3 }]
      }],
      codes: [{
        functionName: 'run', file: '/tmp/project/app.js', line: 3, column: 1,
        updates: [{ severity: 2 }]
      }]
    } ]
  ])
  const state = loadGenerateReport(report)
  try {
    await state.generateReport('/logs/v8.log', 'deoptigate', 'json', undefined, [ 1, 3 ])
    const entries = JSON.parse(state.jsonFiles[0])
    const info = entries[0][1]
    t.assert.equal(info.ics[0].updates.length, 1, 'keeps only matching updates within an event')
    t.assert.equal(info.ics[0].updates[0].severity, 1, 'preserves the selected inline-cache severity')
    t.assert.equal(info.deopts[0].updates[0].severity, 3, 'keeps selected deoptimization severity')
    t.assert.deepEqual(info.codes, [], 'drops events with no selected updates')
  } finally {
    state.restore()
  }
})

test('generate-report keeps combinations of selected event types', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  const report = new Map([
    [ '/tmp/project/app.js', {
      fullPath: '/tmp/project/app.js', relativePath: 'app.js', src: '',
      ics: [{ updates: [{ severity: 1 }] }],
      deopts: [{ updates: [{ severity: 2 }] }],
      codes: [{ updates: [{ severity: 3 }] }]
    } ]
  ])
  const state = loadGenerateReport(report)
  try {
    await state.generateReport('/logs/v8.log', 'deoptigate', 'json', undefined, undefined, [ 'opt', 'deopt' ])
    const entries = JSON.parse(state.jsonFiles[0])
    const info = entries[0][1]
    t.assert.deepEqual(info.ics, [], 'removes IC events not selected')
    t.assert.equal(info.deopts.length, 1, 'keeps selected deoptimization events')
    t.assert.equal(info.codes.length, 1, 'keeps selected optimization events')
  } finally {
    state.restore()
  }
})

test('generate-report keeps only inline-cache events when requested', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const report = new Map([
    [ '/tmp/project/app.js', {
      fullPath: '/tmp/project/app.js', relativePath: 'app.js', src: '',
      ics: [{ updates: [{ severity: 1 }] }],
      deopts: [{ updates: [{ severity: 2 }] }],
      codes: [{ updates: [{ severity: 3 }] }]
    } ]
  ])
  const state = loadGenerateReport(report)
  try {
    await state.generateReport('/logs/v8.log', 'deoptigate', 'json', undefined, undefined, [ 'ic' ])
    const info = JSON.parse(state.jsonFiles[0])[0][1]
    t.assert.equal(info.ics.length, 1, 'keeps inline-cache events')
    t.assert.deepEqual([ info.deopts, info.codes ], [ [], [] ], 'removes optimization and deoptimization events')
  } finally {
    state.restore()
  }
})

test('generate-report omits files with no events at selected severities', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(1)
  const report = new Map([
    [ '/tmp/project/app.js', {
      fullPath: '/tmp/project/app.js', relativePath: 'app.js', src: '',
      ics: [], deopts: [], codes: [{ updates: [{ severity: 2 }] }]
    } ]
  ])
  const state = loadGenerateReport(report)
  try {
    await state.generateReport('/logs/v8.log', 'deoptigate', 'json', undefined, [ 1 ])
    t.assert.deepEqual(JSON.parse(state.jsonFiles[0]), [], 'drops the now-empty file group')
  } finally {
    state.restore()
  }
})
