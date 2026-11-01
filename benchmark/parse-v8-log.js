'use strict'

const path = require('path')
const { Bench } = require('tinybench')
const { processLog } = require('../deoptigate.log')

const logPath = path.resolve(
  process.argv[2] || path.join(__dirname, '../test/logs/adders.prepared.v8.log')
)

async function main() {
  const bench = new Bench({ time: 1000 })
  bench.add('parse V8 log: ' + path.basename(logPath), async () => {
    await processLog(logPath)
  })

  await bench.run()
  console.table(bench.table())
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
