# Clinic.js Deoptigate

[![npm version][npm-version]][npm-url] [![Stability Stable][stability-stable]][stability-docs]

Programmable interface to [Clinic.js][clinic-url] Deoptigate. It records V8
deoptimizations and inline cache changes, then generates an interactive HTML
report using a Clinic.js visualizer. The report can be filtered by low, medium,
or high severity and source path. The original Deoptigate app remains in the
repository under `./app`.

## Issues

To open an issue, use the [main Clinic.js repository][issues-url] with the
`deoptigate` label.

## Installation

```console
npm install --save @clinic/deoptigate
```

## Supported Node.js versions

- Node.js 22.8.0 and above

The native test suite uses Node's built-in test runner and coverage thresholds.

## Run with the Clinic CLI

Install Clinic and this profiler in your project, then start the application
through Clinic:

```sh
npm install --save-dev clinic @clinic/deoptigate
npx clinic deoptigate -- node server.js
```

Clinic opens the report after the profiled process exits. Pass `--no-open` to
generate the report without launching a browser. To collect data on a server
and build the report later:

```sh
npx clinic deoptigate --collect-only -- node server.js
npx clinic deoptigate --visualize-only .clinic/123.clinic-deoptigate
```

Replace `123` with the identifier in the path printed by the first command.

To run a workload when the application starts listening, use `--autocannon`:

```sh
npx clinic deoptigate --autocannon [ -c 10 -d 10 ] -- node server.js
```

## Standalone Deoptigate CLI

The package also keeps the original `deoptigate` executable and its report UI.
Use it to profile an application directly:

```sh
deoptigate app.js
```

Or run `deoptigate` in a directory containing V8 log files to open an existing
log. If several logs match, it prompts you to select one.

## Run the demo

Run a small built-in workload through the profiler's public API and create a
standalone HTML report in a temporary directory:

```sh
npm run demo
```

The command prints the report path under the operating system's temporary
directory. Capture data is stored separately and removed after report
generation, or if the command fails. The HTML report is left in place. The
command does not need a server, external service, or prepared profile data.

## Programmatic API

```js
const ClinicDeoptigate = require('@clinic/deoptigate')
const deoptigate = new ClinicDeoptigate()

deoptigate.collect(['node', './server.js'], function (err, dataPath) {
  if (err) throw err

  deoptigate.visualize(dataPath, `${dataPath}.html`, function (err) {
    if (err) throw err
  })
})
```

### `new ClinicDeoptigate([settings])`

- `dest` — destination for collected data. Defaults to `.clinic`.
- `name` — name for the data directory. Defaults to the process ID.
- `root` — root used to resolve source files. Defaults to the current directory.
- `collectOnFailure` — return collected data when the profiled process exits unsuccessfully. Defaults to `false`.
- `detectPort` — detect the first TCP listening port and emit a `port` event. Defaults to `false`.

### `deoptigate.collect(args, callback)`

Runs the supplied Node.js command with V8 deoptimization and inline cache
logging enabled. The callback receives the path to the collected data
directory. The application’s stdout and stderr are relayed to the current
process.

### `deoptigate.visualize(dataPath, outputFilename, callback)`

Reads collected data and writes a standalone HTML report to `outputFilename`.

### `deoptigate.stopViaIPC()`

When constructed with `detectPort: true`, this stops the profiled process. It
is called by Clinic after an `--on-port` command or `--autocannon` workload
finishes.

### `ClinicDeoptigate.lookupDeoptimizationReason(reasonCode)`

Looks up an exact V8 reason code such as `Hole` in the bundled reason catalog.
It returns the reason code, category, log message, explanation, and examples, or
`null` if the code is unknown. The Clinic MCP server exposes the same lookup as
`lookup_deoptimization_reason`.

## Examples

Run examples from the repository root with Node.js:

```sh
node examples/two-modules/adders.js
```

## License

[MIT](LICENSE)

[npm-version]: https://img.shields.io/npm/v/@clinic/deoptigate.svg?style=flat-square
[npm-url]: https://www.npmjs.org/@clinic/deoptigate
[stability-stable]: https://img.shields.io/badge/stability-stable-green.svg?style=flat-square
[stability-docs]: https://nodejs.org/api/documentation.html#documentation_stability_index
[clinic-url]: https://github.com/clinicjs/node-clinic
[issues-url]: https://github.com/clinicjs/node-clinic/issues
