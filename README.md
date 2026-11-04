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

Use `--format json` to save the full parsed report data as JSON instead of
generating the HTML report:

```sh
deoptigate --format json app.js
```

Use `--format compact_json` for a smaller tuple-based export intended for LLM
input. It omits source text and repeated absolute paths while keeping event
locations, updates, severities, states, and deoptimization reasons:

```sh
deoptigate --format compact_json app.js
```

The output is an array of files. Each file is
`[fullPath, inlineCaches, deoptimizations, optimizations]`. Inline cache
events are `[functionName, line, column, updates]`, with updates shaped as
`[type, oldState, newState, key, map, optimizationState, severity]`.
Deoptimizations use the same event shape, with updates
`[timestamp, bailoutType, deoptReason, optimizationState, inlined, severity]`.
Optimization events are `[functionName, line, column, isScript, updates]`, with
updates `[timestamp, state, severity]`; `isScript` is `1` or `0`.

Use `--format jsonl` to write one readable JSON object per source file. It also
omits source text and repeated event-level file paths:

```sh
deoptigate --format jsonl app.js
```

Add `--filter-file-name` to keep files whose absolute or relative path contains
the given case-sensitive text, and `--filter-severity` to keep only updates at
the selected severity. `--filter-type` keeps selected event categories: `opt`
(optimization), `deopt` (deoptimization), and `ic` (inline cache). Severity
values and event types accept comma-separated combinations. All filters apply
to every output format:

```sh
deoptigate --format compact_json --filter-file-name parseLine --filter-severity 1,3 --filter-type opt,deopt app.js
```

HTML is the default format. Put the format option before the `--` separator
when profiling a command with an explicit Node executable:

```sh
deoptigate --format compact_json -- node app.js
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
