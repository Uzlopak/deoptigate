'use strict'

const { brightBlack } = require('./ansi')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const logFilePattern = /^(?:isolate-.+-)?v8\.log$/

/** @typedef {{fullPath: string, entry: string}} LogFile */

/**
 * Find readable V8 log files directly inside a directory.
 * @param {string} root
 * @returns {Promise<LogFile[]>}
 */
async function findLogFiles(root) {
  const entries = await fs.promises.readdir(root)
  const files = []

  for (const entry of entries) {
    if (!logFilePattern.test(entry)) continue
    const fullPath = path.join(root, entry)
    try {
      await fs.promises.access(fullPath, fs.constants.R_OK)
    } catch (err) {
      continue
    }
    if (!(await fs.promises.stat(fullPath)).isFile()) continue
    files.push({ fullPath, entry })
  }

  return files
}

/**
 * Create a prompt that keeps lines arriving between questions, as piped input
 * can deliver several answers at once.
 * @returns {{ask: (question: string) => Promise<string>, close: () => void}}
 */
function createPrompt() {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout })
  /** @type {string[]} */
  const pendingLines = []
  /** @type {((err: Error) => void) | null} */
  let rejectAnswer = null
  let closed = false
  const closedError = () => new Error('log selection closed before a choice was entered')

  prompt.on('line', line => pendingLines.push(line))
  prompt.once('close', () => {
    closed = true
    if (rejectAnswer != null) rejectAnswer(closedError())
  })

  return {
    ask(question) {
      const pendingLine = pendingLines.shift()
      if (pendingLine != null) return Promise.resolve(pendingLine)
      if (closed) return Promise.reject(closedError())
      return new Promise((resolve, reject) => {
        rejectAnswer = reject
        prompt.question(question, answer => {
          rejectAnswer = null
          resolve(answer || '')
        })
      })
    },
    close() {
      prompt.close()
    }
  }
}

/**
 * Ask the user to choose a log file when more than one is available.
 * @param {LogFile[]} files
 * @param {string} head Command name used in the prompt.
 * @returns {Promise<LogFile>}
 */
async function selectLogFile(files, head) {
  if (files.length === 1) return files[0]

  console.log(`${head}: please select a v8.log file to open:\n`)
  files.forEach((file, index) => console.log(`\t${index + 1}:  ${file.entry}`))

  const prompt = createPrompt()
  try {
    while (true) {
      const answer = await prompt.ask('\n\nYour choice: ')
      if (/^[1-9]\d*$/.test(answer)) {
        const index = Number(answer) - 1
        if (index < files.length) return files[index]
      }
      console.error(`Invalid choice: '${answer}', please select one of the given numbers`)
    }
  } finally {
    prompt.close()
  }
}

/**
 * Select a V8 log file from the current working directory.
 * @param {string} head Command name used in messages.
 * @returns {Promise<string | undefined>} Selected path, or undefined if none exists.
 */
async function selectLog(head) {
  const root = process.cwd()
  const v8logFiles = await findLogFiles(root)

  if (v8logFiles.length === 0) {
    console.error(head + ': Problem:\n')
    console.error(head + ': Unable to find a v8.log or isolate-*-v8.log in the current directory.')
    console.error(head + ': Please produce it via "<node|d8> --trace-ic app.js"')
    return
  }

  const selectedFile = await selectLogFile(v8logFiles, head)
  const p = selectedFile.fullPath
  console.log(`${head} ${brightBlack('Processing logfile at ' + p)}`)
  return p
}

module.exports = selectLog
