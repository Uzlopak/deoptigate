const { readFile, writeFile, mkdir, unlink } = require('fs').promises
const path = require('path')
const { tmpdir } = require('os')
const { spawnSync } = require('child_process')
const test = require('tape')

const repoRoot = (...args) => path.join(__dirname, '..', ...args)
const renderDataPath = path.join(
  tmpdir(),
  'deoptigate',
  'deoptigate.render-data.js'
)

const testOutPath = (...args) =>
  path.join(tmpdir(), 'deoptigate-tests', ...args)

const binPath = repoRoot('bin/deoptigate')
const supportsDeoptLog = spawnSync(
  process.execPath,
  ['--log-deopt', '--version'],
  { stdio: 'ignore' }
).status === 0

async function runDeoptigate(srcPath) {
  // Old V8 versions may append logs and the CLI writes a shared render-data
  // file. Clear both so a prior invocation cannot mask this run's result.
  for (const file of [
    path.join(tmpdir(), 'deoptigate', 'v8.log'),
    renderDataPath
  ]) {
    await unlink(file).catch((err) => {
      if (err.code !== 'ENOENT') throw err
    })
  }
  spawnSync(process.execPath, [binPath, srcPath])

  const contents = await readFile(renderDataPath, 'utf8')

  const outDir = path.dirname(path.relative(repoRoot(), srcPath))
  await mkdir(testOutPath(outDir), { recursive: true })

  const newContents = `function deoptigateRender(info) { return info; }; \nmodule.exports = ${contents.trim()};`
  const outPath = testOutPath(outDir, 'deoptigate.render-data.js')
  await writeFile(outPath, newContents, 'utf8')

  return require(outPath.replace(/.js$/, ''))
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

  for (let i = 0; i < renderData.length; i++) {
    const fileName = renderData[i][0]
    t.equal(fileName, srcPaths[i], `filename in render data ${i}`)

    const fileData = renderData[i][1]
    t.equal(fileData.fullPath, srcPaths[i], `fullPath ${i}`)
    t.assert(Array.isArray(fileData.ics), `ics key is an Array ${i}`)
    t.assert(Array.isArray(fileData.deopts), `deopts key is an Array ${i}`)
    t.assert(Array.isArray(fileData.codes), `codes key is an Array ${i}`)

    const fileSrc = await readFile(srcPaths[i], 'utf8')
    t.equal(fileData.src, fileSrc, `file source ${i}`)
  }
})
