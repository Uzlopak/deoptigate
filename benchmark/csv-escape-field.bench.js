'use strict'

const { Bench } = require('tinybench')
const CsvParser = require('../lib/v8-tools-core/csvparser')

/** Run the CSV field escaping microbenchmarks. @returns {Promise<void>} */
async function main () {
  const parser = new CsvParser()
  const bench = new Bench({ time: 1000 })
  /** @type {string[]} */
  const samples = [
    'plain field without escapes',
    String.raw`C:\work\app.js`,
    String.raw`name\x2Cwith-comma`,
    String.raw`property\u263a`,
    String.raw`unknown\q-escape`,
    String.raw`adjacent\n\x2C\u263a escapes`,
    String.raw`invalid\xG1-escape`,
    String.raw`incomplete\u263-escape`,
    'trailing backslash\\'
  ]

  for (const field of samples) {
    bench.add(`decode 1,024 × ${JSON.stringify(field)}`, () => {
      let decodedLength = 0
      for (let i = 0; i < 1024; i++) decodedLength += parser.escapeField(field).length
      return decodedLength
    })
  }

  await bench.run()
  console.table(bench.table())
}

/** @param {unknown} err */
main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
