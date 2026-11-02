'use strict'

const fs = require('fs')
const EventEmitter = require('events')
const net = require('net')
const os = require('os')
const path = require('path')
const test = require('tape')

const ClinicDeoptigate = require('../src')

function collect (profiler, args) {
  return new Promise((resolve, reject) => {
    profiler.collect(args, (err, outputDir) => {
      if (err) reject(err)
      else resolve(outputDir)
    })
  })
}

function visualize (profiler, source, output) {
  return new Promise((resolve, reject) => {
    profiler.visualize(source, output, err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function removeDirectory (directory) {
  if (fs.promises.rm) return fs.promises.rm(directory, { recursive: true, force: true })
  return fs.promises.rmdir(directory, { recursive: true })
}

async function rejects (t, promise, pattern, message) {
  const err = await promise.then(() => null, error => error)
  t.ok(err instanceof Error, message)
  if (err) t.match(err.message, pattern, message)
}

test('ClinicDeoptigate collects a Node process and creates a Clinic report', async (t) => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-test-'))
  t.teardown(() => removeDirectory(tempDir))

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
  t.equal(dataPath, path.join(tempDir, '.clinic', 'sample.clinic-deoptigate'))
  t.ok(analysing, 'announces analysis after collection')
  t.ok(fs.statSync(path.join(dataPath, 'v8.log')).isFile(), 'stores the V8 log')

  const metadata = JSON.parse(await fs.promises.readFile(path.join(dataPath, 'deoptigate.json'), 'utf8'))
  t.equal(metadata.root, tempDir, 'stores the source root')
  t.ok(Number.isFinite(metadata.elapsedTime), 'stores elapsed time')

  const report = `${dataPath}.html`
  await visualize(profiler, dataPath, report)
  const html = await fs.promises.readFile(report, 'utf8')
  t.ok(html.includes('Clinic Deoptigate'), 'includes the Clinic report title')
  t.ok(html.includes('app.js'), 'embeds the collected source file')
  t.ok(html.includes('Performance overview'), 'renders the deoptigate visualizer')
  t.end()
})

test('ClinicDeoptigate rejects invalid commands and failed child processes', async (t) => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-errors-'))
  t.teardown(() => removeDirectory(tempDir))

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
  t.ok(fs.statSync(path.join(dataPath, 'v8.log')).isFile(), 'retains the log after an accepted failure')
  t.end()
})

test('ClinicDeoptigate reports spawn and visualize errors', async (t) => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-spawn-'))
  t.teardown(() => removeDirectory(tempDir))

  const profiler = new ClinicDeoptigate({ dest: tempDir })
  await rejects(t, collect(profiler, [path.join(tempDir, 'missing-node'), 'app.js']), /spawn/, 'reports spawn errors')
  await rejects(t, visualize(profiler, path.join(tempDir, 'missing-data'), path.join(tempDir, 'report.html')), /ENOENT/, 'reports missing visualization data')

  const badMetadataDir = path.join(tempDir, 'bad-metadata')
  await fs.promises.mkdir(badMetadataDir)
  await fs.promises.copyFile(path.join(__dirname, 'logs', 'adders.prepared.v8.log'), path.join(badMetadataDir, 'v8.log'))
  await fs.promises.writeFile(path.join(badMetadataDir, 'deoptigate.json'), '{invalid json')
  await rejects(t, visualize(profiler, badMetadataDir, path.join(tempDir, 'invalid.html')), /JSON/, 'reports invalid metadata')
  await rejects(t, visualize(profiler, path.join(__dirname, 'logs', 'adders.prepared.v8.log'), path.join(tempDir, 'missing-output', 'report.html')), /ENOENT/, 'reports output write errors')
  t.end()
})

test('ClinicDeoptigate reports log cleanup errors before spawning', async (t) => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-unlink-'))
  t.teardown(() => removeDirectory(tempDir))

  const originalUnlink = fs.promises.unlink
  fs.promises.unlink = () => Promise.reject(Object.assign(new Error('cannot remove log'), { code: 'EACCES' }))
  try {
    const profiler = new ClinicDeoptigate({ dest: tempDir })
    await rejects(t, collect(profiler, [process.execPath, '-e', 'process.exit(0)']), /cannot remove log/, 'reports non-ENOENT cleanup errors')
  } finally {
    fs.promises.unlink = originalUnlink
  }
  t.end()
})

test('ClinicDeoptigate invokes its callback once when a child reports error and exit', async (t) => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-double-finish-'))
  t.teardown(() => removeDirectory(tempDir))

  const childProcess = require('child_process')
  const indexPath = require.resolve('../src')
  const originalSpawn = childProcess.spawn
  childProcess.spawn = () => {
    const child = new EventEmitter()
    setImmediate(() => {
      child.emit('error', new Error('spawn failed'))
      child.emit('exit', 1, null)
    })
    return child
  }

  let MockedClinicDeoptigate
  try {
    delete require.cache[indexPath]
    MockedClinicDeoptigate = require('../src')
  } finally {
    childProcess.spawn = originalSpawn
    delete require.cache[indexPath]
  }

  let callbacks = 0
  const err = await new Promise(resolve => {
    const profiler = new MockedClinicDeoptigate({ dest: tempDir })
    profiler.collect([process.execPath, '-e', ''], error => {
      callbacks++
      resolve(error)
    })
  })
  await new Promise(resolve => setImmediate(resolve))
  t.match(err.message, /spawn failed/)
  t.equal(callbacks, 1, 'ignores the later exit event')
  t.end()
})

test('ClinicDeoptigate detects a listening port and stops after its workload', async (t) => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-port-'))
  t.teardown(() => removeDirectory(tempDir))

  const profiler = new ClinicDeoptigate({ dest: tempDir, name: 'port', detectPort: true })
  const portWasDetected = new Promise(resolve => {
    profiler.once('port', (port, child, stop) => {
      t.ok(Number.isInteger(port) && port > 0, 'reports the application port')
      t.ok(child && child.pid, 'reports the profiled child')
      stop()
      resolve()
    })
  })

  const app = "require('http').createServer((req, res) => res.end('ok')).listen(0)"
  const dataPath = await collect(profiler, [process.execPath, '-e', app])
  await portWasDetected
  t.ok(fs.statSync(path.join(dataPath, 'v8.log')).isFile(), 'writes the log after stopping')

  const invalidPortProfiler = new ClinicDeoptigate({ dest: tempDir, name: 'invalid-port', detectPort: true })
  invalidPortProfiler.once('port', () => t.fail('does not emit an invalid port'))
  const invalidPortScript = "const net = require('net'); const client = net.connect(Number(process.env.CLINIC_DEOPTIGATE_PORT), '127.0.0.1', () => client.end('0'))"
  await collect(invalidPortProfiler, [process.execPath, '-e', invalidPortScript])
  t.pass('continues collection when the reported port is invalid')
  t.end()
})

test('ClinicDeoptigate visualizes a V8 log directly when metadata is absent', async (t) => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-log-'))
  t.teardown(() => removeDirectory(tempDir))

  const profiler = new ClinicDeoptigate({ root: path.resolve(__dirname, '..') })
  const logFile = path.join(__dirname, 'logs', 'adders.prepared.v8.log')
  const output = path.join(tempDir, 'report.html')
  await visualize(profiler, logFile, output)
  const html = await fs.promises.readFile(output, 'utf8')
  t.ok(html.includes('Performance overview'), 'renders the report without metadata')
  t.ok(html.includes('examples/simple/adders.js'), 'resolves source paths from the configured root')
  t.end()
})

test('detect-port reports the first TCP listener and ignores non-TCP addresses', async (t) => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'clinic-deoptigate-inject-'))
  t.teardown(() => removeDirectory(tempDir))

  const injectPath = require.resolve('../src/injects/detect-port')
  const originalListen = net.Server.prototype.listen
  const clinicServer = net.createServer(socket => {
    socket.once('data', data => receivedPorts.push(Number(data.toString())))
  })
  const receivedPorts = []
  const appServers = []
  const unixPath = path.join(tempDir, 'app.sock')

  try {
    await new Promise((resolve, reject) => {
      clinicServer.once('error', reject)
      clinicServer.listen(0, '127.0.0.1', resolve)
    })

    delete process.env.CLINIC_DEOPTIGATE_PORT
    delete require.cache[injectPath]
    require(injectPath)

    process.env.CLINIC_DEOPTIGATE_PORT = String(clinicServer.address().port)
    delete require.cache[injectPath]
    require(injectPath)

    const listen = async server => {
      appServers.push(server)
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
    }

    await listen(net.createServer())
    await new Promise(resolve => setTimeout(resolve, 20))
    t.equal(receivedPorts.length, 1, 'sends the first port to Clinic')

    await listen(net.createServer())
    t.equal(receivedPorts.length, 1, 'does not report later listeners')

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
    await new Promise((resolve, reject) => {
      unixServer.once('error', reject)
      unixServer.listen(unixPath, resolve)
    })
    t.equal(receivedPorts.length, 1, 'ignores addressless and Unix socket servers')
  } finally {
    net.Server.prototype.listen = originalListen
    delete process.env.CLINIC_DEOPTIGATE_PORT
    delete require.cache[injectPath]
    await Promise.all(appServers.map(server => new Promise(resolve => {
      if (!server.listening) return resolve()
      server.close(resolve)
    })))
    await new Promise(resolve => clinicServer.close(resolve))
  }

  t.end()
})

test('stopViaIPC sends SIGINT only to a live profiled process', (t) => {
  const profiler = new ClinicDeoptigate()
  const signals = []
  profiler.process = { exitCode: null, kill: signal => signals.push(signal) }
  profiler.stopViaIPC()
  t.deepEqual(signals, ['SIGINT'])

  profiler.process.exitCode = 0
  profiler.stopViaIPC()
  t.equal(signals.length, 1, 'does not signal an exited process')

  profiler.process = null
  profiler.stopViaIPC()
  t.equal(signals.length, 1, 'does nothing before collection starts')
  t.end()
})
