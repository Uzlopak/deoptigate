const { readFile, writeFile, mkdtemp, readdir, lstat, unlink, rmdir } = require('fs').promises
const path = require('path')
const { tmpdir } = require('os')
const { spawnSync } = require('child_process')
const Module = require('module')
const test = require('tape')

const repoRoot = (...args) => path.join(__dirname, '..', ...args)
const binPath = repoRoot('bin/deoptigate')
const supportsDeoptLog = spawnSync(
  process.execPath,
  ['--log-deopt', '--version'],
  { stdio: 'ignore' }
).status === 0

async function removeDirectory(dir) {
  const entries = await readdir(dir).catch(err => {
    if (err.code === 'ENOENT') return []
    throw err
  })
  for (const entry of entries) {
    const entryPath = path.join(dir, entry)
    const stats = await lstat(entryPath)
    if (stats.isDirectory()) await removeDirectory(entryPath)
    else await unlink(entryPath)
  }
  await rmdir(dir).catch(err => {
    if (err.code !== 'ENOENT') throw err
  })
}

async function runDeoptigate(srcPath) {
  const isolatedTmpDir = await mkdtemp(path.join(tmpdir(), 'deoptigate-bin-test-'))

  try {
    const env = Object.assign({}, process.env, { TMPDIR: isolatedTmpDir })
    const result = spawnSync(process.execPath, [binPath, srcPath], { encoding: 'utf8', env })
    if (result.status !== 0) {
      const reason = result.error ? result.error.message : `exit status ${result.status}`
      throw new Error(`deoptigate CLI failed (${reason}):\n${result.stderr}`)
    }

    const renderDataPath = path.join(isolatedTmpDir, 'deoptigate', 'deoptigate.render-data.js')
    const contents = await readFile(renderDataPath, 'utf8')
    const newContents = `function deoptigateRender(info) { return info; }; \nmodule.exports = ${contents.trim()};`
    const outPath = path.join(isolatedTmpDir, 'render-data.js')
    await writeFile(outPath, newContents, 'utf8')

    return require(outPath.replace(/.js$/, ''))
  } finally {
    await removeDirectory(isolatedTmpDir)
  }
}

test('deoptigate simple/adders.js', async (t) => {
  if (!supportsDeoptLog) {
    t.skip('current Node/V8 does not support --log-deopt')
    t.end()
    return
  }

  const srcPath = repoRoot('examples/simple/adders.js')

  const renderData = await runDeoptigate(srcPath)
  t.equal(renderData.length, 1, 'number of files')

  const fileName = renderData[0][0]
  t.equal(fileName, srcPath, 'filename in render data')

  const fileData = renderData[0][1]
  t.equal(fileData.fullPath, srcPath, 'fullPath')
  t.assert(Array.isArray(fileData.ics), 'ics key is an Array')
  t.assert(Array.isArray(fileData.deopts), 'deopts key is an Array')
  t.assert(Array.isArray(fileData.codes), 'codes key is an Array')
  t.ok(fileData.ics.length > 0, 'example produces inline-cache records')
  t.ok(fileData.deopts.length > 0, 'example produces deoptimization records')
  t.ok(fileData.codes.length > 0, 'example produces code-state records')

  const fileSrc = await readFile(srcPath, 'utf8')
  t.equal(fileData.src, fileSrc, 'file source')
})

test('deoptigate two-modules/adders.js', async (t) => {
  if (!supportsDeoptLog) {
    t.skip('current Node/V8 does not support --log-deopt')
    t.end()
    return
  }

  const srcPaths = [
    repoRoot('examples/two-modules/adders.js'),
    repoRoot('examples/two-modules/objects.js'),
  ]

  const renderData = await runDeoptigate(srcPaths[0])
  t.equal(renderData.length, 2, 'number of files')

  const filesByName = new Map(renderData)
  let icCount = 0
  let codeCount = 0
  for (const srcPath of srcPaths) {
    const fileData = filesByName.get(srcPath)
    t.ok(fileData, `render data contains ${srcPath}`)
    if (fileData == null) continue

    t.equal(fileData.fullPath, srcPath, `fullPath for ${srcPath}`)
    t.assert(Array.isArray(fileData.ics), `ics key is an Array for ${srcPath}`)
    t.assert(Array.isArray(fileData.deopts), `deopts key is an Array for ${srcPath}`)
    t.assert(Array.isArray(fileData.codes), `codes key is an Array for ${srcPath}`)
    icCount += fileData.ics.length
    codeCount += fileData.codes.length

    const fileSrc = await readFile(srcPath, 'utf8')
    t.equal(fileData.src, fileSrc, `file source for ${srcPath}`)
  }
  t.ok(icCount > 0, 'examples produce inline-cache records')
  t.ok(codeCount > 0, 'examples produce code-state records')
})

test('CLI sets a nonzero exit status when a command fails', async (t) => {
  const originalLoad = Module._load
  const originalError = console.error
  const originalExitCode = process.exitCode
  const errors = []
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === binPath) {
      if (request === './deoptigate.generate-report') return async () => {}
      if (request === './deoptigate.find-log') return async () => 'unused.log'
      if (request === './deoptigate.create-log') return async () => { throw new Error('synthetic CLI failure') }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  console.error = message => { errors.push(message) }
  delete require.cache[binPath]

  try {
    require(binPath)
    await new Promise(resolve => setImmediate(resolve))
    t.equal(process.exitCode, 1, 'caught CLI errors set a nonzero exit status')
    t.match(errors[0], /synthetic CLI failure/, 'caught CLI errors are written to stderr')
  } finally {
    Module._load = originalLoad
    console.error = originalError
    process.exitCode = originalExitCode
    delete require.cache[binPath]
  }
  t.end()
})
