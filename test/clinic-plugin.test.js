'use strict'

const fs = require('fs')
const EventEmitter = require('events')
const net = require('net')
const os = require('os')
const path = require('path')
/** @type {typeof import('node:test').test} */
const test = require('node:test').test

const ClinicDeoptigate = require('../src')

/**
 * Create a promise for an operation that completes without a result.
 * @param {(resolve: () => void, reject: (reason: unknown) => void) => void} executor
 * @returns {Promise<void>}
 */
function waitFor (executor) {
  return new Promise((resolve, reject) => executor(resolve, reject))
}

/**
 * @param {InstanceType<typeof ClinicDeoptigate>} profiler
 * @param {string[]} args
 * @returns {Promise<string>}
 */
function collect (profiler, args) {
  return new Promise((resolve, reject) => {
    profiler.collect(args, (err, outputDir) => {
      if (err) reject(err)
      else resolve(/** @type {string} */ (outputDir))
    })
  })
}

/**
 * @param {InstanceType<typeof ClinicDeoptigate>} profiler
 * @param {string} source
 * @param {string} output
 * @returns {Promise<void>}
 */
function visualize (profiler, source, output) {
  return new Promise((resolve, reject) => {
    profiler.visualize(source, output, err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/**
 * @param {string} directory
 * @returns {Promise<void>}
 */
function removeDirectory (directory) {
  return fs.promises.rm(directory, { recursive: true, force: true })
}

/**
 * @param {import('node:test').TestContext} t
 * @param {Promise<unknown>} promise
 * @param {RegExp} pattern
 * @param {string} message
 * @returns {Promise<void>}
 */
async function rejects (t, promise, pattern, message) {
  const err = await promise.then(() => null, error => error)
  t.assert.ok(err instanceof Error, message)
  if (err) t.assert.match(err.message, pattern, message)
}

test('ClinicDeoptigate collects a Node process and creates a Clinic report', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(8)
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-test-'))
  t.after(() => removeDirectory(tempDir))

  const app = path.join(tempDir, 'app.js')
  await fs.promises.writeFile(app, 'function add (a, b) { return a + b }; for (let i = 0; i < 10000; i++) add(i, i)\n')

  const profiler = new ClinicDeoptigate({
    dest: path.join(tempDir, '.clinic'),
    name: 'sample',
    root: tempDir
  })
  let analysing = false
  profiler.once('analysing', () => { analysing = true })

  const dataPath = await collect(profiler, [process.execPath, app])
  t.assert.equal(dataPath, path.join(tempDir, '.clinic', 'sample.clinic-deoptigate'))
  t.assert.ok(analysing, 'announces analysis after collection')
  t.assert.ok(fs.statSync(path.join(dataPath, 'v8.log')).isFile(), 'stores the V8 log')

  const metadata = JSON.parse(await fs.promises.readFile(path.join(dataPath, 'deoptigate.json'), 'utf8'))
  t.assert.equal(metadata.root, tempDir, 'stores the source root')
  t.assert.ok(Number.isFinite(metadata.elapsedTime), 'stores elapsed time')

  const report = `${dataPath}.html`
  await visualize(profiler, dataPath, report)
  const html = await fs.promises.readFile(report, 'utf8')
  t.assert.ok(html.includes('Clinic Deoptigate'), 'includes the Clinic report title')
  t.assert.ok(html.includes('app.js'), 'embeds the collected source file')
  t.assert.ok(html.includes('Performance overview'), 'renders the deoptigate visualizer')
})

test('ClinicDeoptigate prevents concurrent collections from overwriting the same output', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-concurrent-'))
  t.after(() => removeDirectory(tempDir))

  const profiler = new ClinicDeoptigate({ dest: tempDir, name: 'shared' })
  const first = collect(profiler, [process.execPath, '-e', 'setTimeout(() => {}, 100)'])
  await rejects(
    t,
    collect(profiler, [process.execPath, '-e', 'process.exit(0)']),
    /collection is already active/,
    'rejects a second collection targeting the same profile path'
  )
  const dataPath = await first
  t.assert.ok(fs.statSync(path.join(dataPath, 'v8.log')).isFile(), 'retains the first collection log')
})

test('ClinicDeoptigate rejects invalid commands and failed child processes', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(7)
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-errors-'))
  t.after(() => removeDirectory(tempDir))

  const profiler = new ClinicDeoptigate({ dest: tempDir, name: 'failure' })
  await rejects(t, collect(profiler, []), /expected Node\.js executable and script arguments/, 'rejects an invalid command')
  await rejects(t, collect(profiler, [process.execPath, '-e', 'process.exit(7)']), /exited with code 7/, 'rejects a failed child')
  await rejects(t, collect(profiler, [process.execPath, '-e', "process.kill(process.pid, 'SIGTERM')"]), /signal SIGTERM/, 'reports signal termination')

  const acceptingFailure = new ClinicDeoptigate({
    dest: tempDir,
    name: 'accepted-failure',
    collectOnFailure: true
  })
  const dataPath = await collect(acceptingFailure, [process.execPath, '-e', 'process.exit(7)'])
  t.assert.ok(fs.statSync(path.join(dataPath, 'v8.log')).isFile(), 'retains the log after an accepted failure')
})

test('ClinicDeoptigate reports spawn and visualize errors', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(8)
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-spawn-'))
  t.after(() => removeDirectory(tempDir))

  const profiler = new ClinicDeoptigate({ dest: tempDir })
  await rejects(t, collect(profiler, [path.join(tempDir, 'missing-node'), 'app.js']), /spawn/, 'reports spawn errors')
  await rejects(t, visualize(profiler, path.join(tempDir, 'missing-data'), path.join(tempDir, 'report.html')), /ENOENT/, 'reports missing visualization data')

  const badMetadataDir = path.join(tempDir, 'bad-metadata')
  await fs.promises.mkdir(badMetadataDir)
  await fs.promises.copyFile(path.join(__dirname, 'logs', 'adders.v8.log'), path.join(badMetadataDir, 'v8.log'))
  await fs.promises.writeFile(path.join(badMetadataDir, 'deoptigate.json'), '{invalid json')
  await rejects(t, visualize(profiler, badMetadataDir, path.join(tempDir, 'invalid.html')), /JSON/, 'reports invalid metadata')
  await rejects(t, visualize(profiler, path.join(__dirname, 'logs', 'adders.v8.log'), path.join(tempDir, 'missing-output', 'report.html')), /ENOENT/, 'reports output write errors')
})

test('ClinicDeoptigate reports log cleanup errors before spawning', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-unlink-'))
  t.after(() => removeDirectory(tempDir))

  const originalUnlink = fs.promises.unlink
  fs.promises.unlink = () => Promise.reject(Object.assign(new Error('cannot remove log'), { code: 'EACCES' }))
  try {
    const profiler = new ClinicDeoptigate({ dest: tempDir })
    await rejects(t, collect(profiler, [process.execPath, '-e', 'process.exit(0)']), /cannot remove log/, 'reports non-ENOENT cleanup errors')
  } finally {
    fs.promises.unlink = originalUnlink
  }
})

test('ClinicDeoptigate invokes its callback once when a child reports error and exit', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-double-finish-'))
  t.after(() => removeDirectory(tempDir))

  const childProcess = require('child_process')
  const indexPath = require.resolve('../src')
  const originalSpawn = childProcess.spawn
  Object.defineProperty(childProcess, 'spawn', { value: () => {
    const child = new EventEmitter()
    setImmediate(() => {
      child.emit('error', new Error('spawn failed'))
      child.emit('exit', 1, null)
    })
    return child
  } })

  let MockedClinicDeoptigate
  try {
    delete require.cache[indexPath]
    MockedClinicDeoptigate = require('../src')
  } finally {
    childProcess.spawn = originalSpawn
    delete require.cache[indexPath]
  }

  let callbacks = 0
  const err = await new Promise(/** @param {(error: Error) => void} resolve */ resolve => {
    const profiler = new MockedClinicDeoptigate({ dest: tempDir })
    profiler.collect([process.execPath, '-e', ''], error => {
      callbacks++
      if (error) resolve(error)
    })
  })
  await waitFor(resolve => setImmediate(resolve))
  t.assert.match(err.message, /spawn failed/)
  t.assert.equal(callbacks, 1, 'ignores the later exit event')
})

test('ClinicDeoptigate detects a listening port and stops after its workload', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-port-'))
  t.after(() => removeDirectory(tempDir))

  const profiler = new ClinicDeoptigate({ dest: tempDir, name: 'port', detectPort: true })
  const portWasDetected = waitFor(resolve => {
    profiler.once('port', (port, child, stop) => {
      t.assert.ok(Number.isInteger(port) && port > 0, 'reports the application port')
      t.assert.ok(child && child.pid, 'reports the profiled child')
      stop()
      resolve()
    })
  })

  const app = "require('http').createServer((req, res) => res.end('ok')).listen(0)"
  const dataPath = await collect(profiler, [process.execPath, '-e', app])
  await portWasDetected
  t.assert.ok(fs.statSync(path.join(dataPath, 'v8.log')).isFile(), 'writes the log after stopping')

  const invalidPortProfiler = new ClinicDeoptigate({ dest: tempDir, name: 'invalid-port', detectPort: true })
  let invalidPortReported = false
  invalidPortProfiler.once('port', () => { invalidPortReported = true })
  const invalidPortScript = "const net = require('net'); const client = net.connect(Number(process.env.CLINIC_DEOPTIGATE_PORT), '127.0.0.1', () => client.end('0'))"
  await collect(invalidPortProfiler, [process.execPath, '-e', invalidPortScript])
  t.assert.equal(invalidPortReported, false, 'continues collection when the reported port is invalid')
})

test('ClinicDeoptigate visualizes a V8 log directly when metadata is absent', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(2)
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-log-'))
  t.after(() => removeDirectory(tempDir))

  const root = path.join(tempDir, 'root')
  const source = path.join(root, 'examples/simple/adders.js')
  await fs.promises.mkdir(path.dirname(source), { recursive: true })
  await fs.promises.writeFile(source, 'function add (a, b) { return a + b }; for (let i = 0; i < 10000; i++) add(i, i)\n')
  const profiler = new ClinicDeoptigate({ dest: tempDir, name: 'direct-log', root })
  const dataPath = await collect(profiler, [process.execPath, source])
  const logFile = path.join(dataPath, 'v8.log')
  await fs.promises.unlink(path.join(dataPath, 'deoptigate.json'))
  const output = path.join(tempDir, 'report.html')
  await visualize(profiler, logFile, output)
  const html = await fs.promises.readFile(output, 'utf8')
  t.assert.ok(html.includes('Performance overview'), 'renders the report without metadata')
  t.assert.ok(html.includes('examples/simple/adders.js'), 'resolves source paths from the configured root')
})

test('detect-port reports the first TCP listener and ignores non-TCP addresses', async (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(4)
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-inject-'))
  t.after(() => removeDirectory(tempDir))

  const injectPath = require.resolve('../src/injects/detect-port')
  const originalListen = net.Server.prototype.listen
  const originalCreateConnection = net.createConnection
  const clinicServer = net.createServer(socket => {
    socket.once('data', data => receivedPorts.push(Number(data.toString())))
  })
  const receivedPorts = []
  const appServers = []
  const unixPath = path.join(tempDir, 'app.sock')

  try {
    await waitFor((resolve, reject) => {
      clinicServer.once('error', reject)
      clinicServer.listen(0, '127.0.0.1', () => resolve())
    })

    delete process.env.CLINIC_DEOPTIGATE_PORT
    delete require.cache[injectPath]
    require(injectPath)

    const clinicAddress = clinicServer.address()
    if (clinicAddress == null || typeof clinicAddress === 'string') throw new Error('Clinic server has no TCP address')
    process.env.CLINIC_DEOPTIGATE_PORT = String(clinicAddress.port)
    delete require.cache[injectPath]
    require(injectPath)

    /** @param {import('node:net').Server} server */
    const listen = async server => {
      appServers.push(server)
    await waitFor((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => resolve())
      })
    }

    await listen(net.createServer())
    await waitFor(resolve => setTimeout(resolve, 20))
    t.assert.equal(receivedPorts.length, 1, 'sends the first port to Clinic')

    await listen(net.createServer())
    t.assert.equal(receivedPorts.length, 1, 'does not report later listeners')

    net.Server.prototype.listen = originalListen
    delete require.cache[injectPath]
    require(injectPath)
    const noAddress = net.createServer()
    noAddress.address = () => null
    await listen(noAddress)

    net.Server.prototype.listen = originalListen
    delete require.cache[injectPath]
    require(injectPath)
    const unixServer = net.createServer()
    appServers.push(unixServer)
    await waitFor((resolve, reject) => {
      unixServer.once('error', reject)
      unixServer.listen(unixPath, () => resolve())
    })
    t.assert.equal(receivedPorts.length, 1, 'ignores addressless and Unix socket servers')

    let connectionErrorEmitted = false
    Object.defineProperty(net, 'createConnection', { value: () => {
      const client = new EventEmitter()
      const emit = client.emit
      client.emit = function (event, ...args) {
        if (event === 'error') connectionErrorEmitted = true
        return emit.call(this, event, ...args)
      }
      process.nextTick(() => client.emit('error', new Error('synthetic connection failure')))
      return client
    } })
    net.Server.prototype.listen = originalListen
    delete require.cache[injectPath]
    require(injectPath)
    await listen(net.createServer())
    await waitFor(resolve => setImmediate(resolve))
    t.assert.equal(connectionErrorEmitted, true, 'handles errors connecting back to Clinic')
  } finally {
    net.Server.prototype.listen = originalListen
    net.createConnection = originalCreateConnection
    delete process.env.CLINIC_DEOPTIGATE_PORT
    delete require.cache[injectPath]
    await Promise.all(appServers.map(server => waitFor(resolve => {
      if (!server.listening) return resolve()
      server.close(() => resolve())
    })))
    await waitFor(resolve => clinicServer.close(resolve))
  }

})

test('stopViaIPC sends SIGINT only to a live profiled process', (/** @type {import('node:test').TestContext} */ t) => {
  t.plan(3)
  const profiler = new ClinicDeoptigate()
  /** @type {NodeJS.Signals[]} */
  const signals = []
  /** @type {{exitCode: number | null, kill: (signal: NodeJS.Signals) => boolean}} */
  const processStub = { exitCode: null, kill: (signal) => { signals.push(signal); return true } }
  Object.defineProperty(profiler, 'process', { value: processStub, writable: true })
  profiler.stopViaIPC()
  t.assert.deepEqual(signals, ['SIGINT'])

  processStub.exitCode = 0
  profiler.stopViaIPC()
  t.assert.equal(signals.length, 1, 'does not signal an exited process')

  profiler.process = null
  profiler.stopViaIPC()
  t.assert.equal(signals.length, 1, 'does nothing before collection starts')
})
