'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { execFile } = require('node:child_process')
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')

const run = promisify(execFile)
const root = path.join(__dirname, '..')
const major = process.versions.node.split('.')[0]

// Deopts depend on the V8 version, so a clean result is only claimed where it was
// measured. Pretenuring deopts depend on GC timing: on Node.js 26 a site that
// flips them only shows up in about a quarter of runs.
const CLEAN_MAJORS = new Set(['22', '24', '26'])

/**
 * @typedef {object} FileReport
 * @property {string} relativePath
 * @property {{functionName: string, updates: {deoptReason: string}[]}[]} deopts
 */

/**
 * Profile a program the way a user profiles their own, at every severity.
 * @param {string} program Path to the script to run.
 * @returns {Promise<string[]>} One `file function: reason` row per deopt.
 */
async function profileDeopts (program) {
  const dir = await mkdtemp(path.join(tmpdir(), 'deoptigate-self-'))
  try {
    // Coverage collection changes what V8 optimizes, so the child must not inherit it.
    const { NODE_V8_COVERAGE, ...env } = process.env
    await run(process.execPath, [
      path.join(root, 'bin/deoptigate'),
      '--format', 'jsonl', '--filter-type', 'deopt',
      '--', process.execPath, program
    ], { cwd: root, env: { ...env, TMPDIR: dir, TEMP: dir, TMP: dir } })

    const report = await readFile(path.join(dir, 'deoptigate', 'deoptigate.jsonl'), 'utf8')
    return report.split('\n').filter(Boolean).flatMap(line => {
      const { relativePath, deopts } = /** @type {FileReport} */ (JSON.parse(line))
      return deopts.flatMap(({ functionName, updates }) =>
        updates.map(({ deoptReason }) => `${relativePath} ${functionName}: ${deoptReason}`)
      )
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('a deoptimizing program shows up, so an empty report means something', async () => {
  const dir = await mkdtemp(path.join(root, '.self-deopts-'))
  try {
    const program = path.join(dir, 'deoptimizes.js')
    await writeFile(program, `
      function read(object) { return object.x }
      for (let i = 0; i < 2e5; i++) read({ x: i })
      for (let i = 0; i < 2e5; i++) read({ other: 1, x: i })
    `)
    assert.ok((await profileDeopts(program)).some(deopt => deopt.includes('wrong map')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('parsing a log does not deoptimize deoptigate itself', {
  skip: !CLEAN_MAJORS.has(major) && `not measured on Node.js ${major}`
}, async () => {
  assert.deepStrictEqual(await profileDeopts(path.join(root, 'benchmark/parse-v8-log.js')), [])
})
