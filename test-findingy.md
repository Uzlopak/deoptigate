# Critical review findings

Scope: static review of the working tree, including application, CLI, parsing/grouping, rendering, tests, and the current edits. The vendored `v8/` tree and generated `app/build/` bundle were not reviewed as source. Tests were not run.

## Processing and test findings

### High: a malformed deopt source position can abort the whole log conversion

[`DeoptEntry.disassembleSourcePosition`](lib/log-processing/deopt-entry.js:82) intentionally returns `file: null` when it cannot parse a source position. That deopt is retained in processor output, but [`resolveFiles`](lib/grouping/resolve-files.js:35) puts its `null` file into the path set and [`resolveAll`](lib/grouping/resolve-files.js:22) passes it to `path.resolve`, which throws. This defeats the later null-file filtering in `group-by-file.js` and makes one malformed or non-source deopt fail processing of the entire log. Filter missing file keys before resolving paths and add an end-to-end malformed-position case.

### High: `icStateChangesOnly: false` still discards unchanged IC updates

[`processLogContent`](deoptigate.js:264) always calls `filterIcStateChanges()`. The log-processing API applies the same filter only when `icStateChangesOnly` is true ([`deoptigate.log.js`](deoptigate.log.js:14)), but at that point unchanged IC events are already gone, so passing `false` cannot restore them. Either make filtering the caller's choice or preserve raw IC updates until that option is applied. There is no test comparing true and false behavior.

### Medium: modern inline-cache record parsing has no focused assertion

[`deoptigate.js`](deoptigate.js:120) selects field offsets based on the record length to support V8's timestamped IC format. The checked-in end-to-end V8 log fixtures are old format, and the live-case test examines deopts while discarding IC updates. The CLI test only checks that `ics` is an array. A regression in the modern IC offsets or field values could pass. Add a synthetic test with one legacy and one timestamped IC line and assert the parsed location, old/new states, map, and key.

### Low: the parser-error test bypasses the parser error path

[`test/deoptigate-core-coverage.test.js`](test/deoptigate-core-coverage.test.js:30) calls `processor.printError()` directly. It verifies that method's console output, but not that a malformed log record is caught by `LogReader`, routed through `printError`, and does not abort processing. Feed an invalid record between valid records and assert the error plus continued processing.

### Low: the synthetic move record is not distinguished from an ignored move

[`test/deopt-reasons.test.js`](test/deopt-reasons.test.js:68) includes `sfi-move`, then only checks that two code updates at the same location serialize. Because both code-creation records already use the same function name, that assertion can still pass if `sfi-move` is ignored. Use different pre/post move names or assert address lookup effects so the test proves the move was applied.

### Medium: unknown bailout types are summarized as the least severe category

[`DeoptEntry.getSeverity`](lib/log-processing/deopt-entry.js:19) returns `undefined` for an unrecognized bailout type, and [the unit test explicitly covers that case](test/deopt-entry.test.js:13). Later, [`highestSeverity`](lib/severities.js:10) leaves its default severity of 1 when it encounters `undefined`, so [`summarizeFile`](lib/grouping/summarize-file.js:23) counts the unknown event as severity 1. This turns an unknown V8 event into a misleading low-severity summary instead of preserving its unknown status or handling it explicitly. Add an aggregate-level test and define a deliberate policy for unknown severities.

### Medium: function names containing colons break location decoding and marker order

[`keyLocation`](lib/grouping/location.js:3) uses colons as separators, while [`unkeyLocation`](lib/grouping/location.js:11) splits on every colon and keeps only the first three pieces. A valid JavaScript inferred function name containing a colon makes the decoded line and column wrong; sorting and renderer traversal then place its marker incorrectly. Decode the final two numeric segments from the right, or use a structured key, and add a colon-containing function-name case.

## Additional implementation findings

### High: fallback code rendering inserts source text as raw HTML

[`lib/rendering/mark-only.js`](lib/rendering/mark-only.js:66) interpolates source lines directly into HTML, and [`app/components/code.js`](app/components/code.js:101) uses this path when highlighting is off, source is large, or highlighting fails. The final exception fallback at [`app/components/code.js`](app/components/code.js:120) does the same. Since the result is rendered through `dangerouslySetInnerHTML`, source containing markup can alter the visualization DOM; a script-capable payload may execute when the generated report is opened. Escape source text before inserting markers, while preserving the marker markup.

### High: Windows paths are truncated in code and IC records

[`lib/log-processing/code-entry.js`](lib/log-processing/code-entry.js:5) and [`lib/log-processing/ic-entry.js`](lib/log-processing/ic-entry.js:8) normalize filenames with `file.split(':')[0]`. A path such as `C:\work\app.js:12:4` becomes just `C`; a `file:///...` ESM URL becomes just `file`. Paths containing spaces are also truncated by the separate `fnFile.split(' ')` parsing at [`code-entry.js`](lib/log-processing/code-entry.js:12) and [`ic-entry.js`](lib/log-processing/ic-entry.js:25). Deoptimization source positions have a separate parser that preserves colons, so the current path test covers only deopts and misses broken optimization/IC records. Parse the trailing source coordinates and separate function names from paths without splitting valid path contents.

### High: V8 CSV decoding corrupts escaped backslashes before path parsing

V8's log writer escapes a literal backslash as `\\` ([vendored `log-file.cc`](v8/src/logging/log-file.cc:176)). The `v8-tools-core` CSV parser used by [`LogReader`](deoptigate.js:5) does not treat a doubled backslash as a backslash: its [`escapeField`](node_modules/v8-tools-core/csvparser.js:47) treats every non-`n`/`x` escape as a four-hex-digit Unicode escape. For a Windows path this turns path text into NUL/replacement characters before the deopt, code, or IC parsers see it. The direct `DeoptEntry.disassembleSourcePosition` Windows test bypasses CSV parsing, so it cannot catch this. Add an end-to-end escaped-path record test and fix or replace the CSV unescape behavior.

### Medium: the line-reader test does not exercise the changed UTF-8 boundary behavior

[`test/line-reader.test.js`](test/line-reader.test.js:12) uses a tiny input that is read in one chunk. The new `StringDecoder` logic is specifically needed when a multibyte UTF-8 character is split across read chunks, but the test never forces that condition. A regression in the primary reason for this change can therefore pass. Make chunk size injectable or test a file larger than the reader's chunk size with a multibyte character positioned across the boundary.

### Medium: CLI integration tests accept empty analysis arrays

[`test/deoptigate.bin.test.js`](test/deoptigate.bin.test.js:77) checks only that `ics`, `deopts`, and `codes` are arrays. The example can still pass if an expected category such as `deopts` is empty, provided another category produced enough data for the file to appear. Assert representative records or require the categories the example is meant to exercise to contain data.

### Medium: CLI tests delete shared files in the global temp directory

[`test/deoptigate.bin.test.js`](test/deoptigate.bin.test.js:35) unlinks `/tmp/deoptigate/v8.log` and `/tmp/deoptigate/deoptigate.render-data.js` before every CLI run. These are also the application's normal output paths. Running tests can delete a user's existing log/report, and parallel test processes can race over the same files. Use a test-specific temp directory and pass it through an injectable output path or isolated environment.

### Medium: toolbar checkbox state can diverge from application state

[`app/components/toolbar.js`](app/components/toolbar.js:42) uses `defaultChecked`, so React does not keep the checkbox synchronized with updated props. The app changes these props on browser-history restoration in [`app/main.js`](app/main.js:203). After navigating back/forward, the rendered checkbox can show a stale setting; its handler also computes the next value from props rather than `event.target.checked`. Use controlled `checked` inputs and consume the event's checked value.

### High: partial query strings can leave the UI with invalid tab state

[`app/lib/query-state.js`](app/lib/query-state.js:18) parses every field even when the URL omits it. Missing numeric values become `NaN` and missing booleans become `false`; for example, a URL containing only `selectedFileIdx=0` produces `NaN` tab indices, so neither main tab is selected and the page content can be hidden. Parse only supplied fields and merge them over defaults.

### Medium: Back to the original history entry does not restore the initial UI

[`app/main.js`](app/main.js:203) returns immediately when `history.state` is null. The original page entry normally has null state; after the first click pushes a state, navigating Back to that entry leaves the current React state untouched instead of restoring the initial selection/settings. Restore state from the URL/defaults when the history entry has no state.

### Medium: CLI errors are reported with a successful process exit status

[`bin/deoptigate`](bin/deoptigate:19) catches the full CLI pipeline and only logs the error. It does not set `process.exitCode`, so automation can see exit status 0 even when no log is found or rendering fails. Set a nonzero exit status in the catch path.

### Medium: app flags after the script are also passed to Node

[`bin/deoptigate.create-log.js`](bin/deoptigate.create-log.js:43) pushes a flag after the script into `argv`, then falls through and also pushes it into `extraExecArgv`. Thus `node app.js --app-flag` passes `--app-flag` as a Node option as well as an application argument. The existing create-log test checks that the flag is present in `argv` but omits the assertion that it is absent from `execArgv`, so it misses the duplication. Once `sawApp` is true, append arguments to `argv` and continue.

### Medium: code view skips rerender when marker data changes but source text does not

[`app/components/code.js`](app/components/code.js:55) has a `shouldComponentUpdate` that ignores `fileName`, marker maps, and location lists. Selecting two files with identical source text but different deopt/IC locations can therefore leave the old file's markers visible. Include the relevant data props in the update decision or remove this optimization.

### Low: React state is mutated before `setState`

[`app/main.js`](app/main.js:254) and the other event handlers use `Object.assign(this.state, …)`, changing the current state object before asking React to update. This defeats React's state update model and can produce stale or lost values when updates are batched. Pass a new object or use functional `setState` updates.

### Medium: the initial UI state is mutated globally

[`app/main.js`](app/main.js:43) assigns URL-derived state into the module-level `initialState` object. Constructing another `MainView` without the same URL state can inherit selections and preferences from the prior instance. Build each instance's initial state from a fresh copy of defaults.

### Low: line-number padding is wrong for files with 1–9 million lines

[`lib/rendering/mark-only.js`](lib/rendering/mark-only.js:10) returns `2` digits for line counts from 1,000,000 through 9,999,999. Those line numbers need 7 digits; the line-number column becomes misaligned for unusually large files.

### Low: log parser tests leave ignored prepared files in the repository

[`test/deoptigate.log.test.js`](test/deoptigate.log.test.js:22) writes `.prepared.v8.log` files beside the checked-in fixtures and does not remove them. They are ignored, so normal Git status does not reveal the generated artifacts; repeated test runs leave extra files in the checkout. Write these into an OS temp directory and clean them in `finally`.

### Low: coverage command excludes the browser UI source

The `test:coverage` command in [`package.json`](package.json:17) includes `app/lib/**/*.js` but excludes `app/main.js` and `app/components/**/*.js`, where most UI state, event, and rendering behavior lives. The reported coverage therefore cannot show untested UI logic, and the current tests do not exercise those components. Add those source paths to the coverage scope and add focused UI tests.

## Test edits reviewed

- The code-deletion test now checks a downstream deopt lookup after deleting the code address, so it would catch deletion being ignored. That is a meaningful improvement over the prior unconditional `t.pass()`.
- The CLI integration helper now fails on a nonzero child exit status and includes stderr. That closes the prior false-positive path where output alone was treated as success.
- The argument-routing test change still misses a real duplication bug: app flags after the script are asserted in `argv` but not checked for absence from `execArgv`.
- The deopt-reason test title now accurately says it retains supplied messages; it still does not test mapping messages to reason IDs, which is covered separately by the live-case test when the runtime supports those cases.

