'use strict'

const fs = require('fs')
const path = require('path')
const { Bench } = require('tinybench')
const CsvParser = require('../lib/v8-tools-core/csvparser')

const LINE_ENDINGS_RX = /\r?\n/

const logPath = path.resolve(
  process.argv[2] || path.join(__dirname, '../test/logs/adders.prepared.v8.log')
)

async function main() {
  const lines = fs.readFileSync(logPath, 'utf8').split(LINE_ENDINGS_RX).filter(Boolean)
  const parser = new CsvParser()
  const bench = new Bench({ time: 1000 })

  bench.add(`parse ${lines.length} V8 CSV rows: ${path.basename(logPath)}`, () => {
    let fieldsParsed = 0
    for (const line of lines) fieldsParsed += parser.parseLine(line).length
    return fieldsParsed
  })
  await bench.run()
  console.table(bench.table())
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
