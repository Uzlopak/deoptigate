'use strict'

const https = require('https')
const fs = require('fs')
const path = require('path')

const firstMajor = 8
const lastMajor = 15
const headerPath = 'src/deoptimizer/deoptimize-reason.h'
const cachedHeadersDir = process.argv[2]
const outputPath = process.argv[3] || path.join(__dirname, '..', 'lib', 'fixtures', 'v8-deopt-reason-aliases.json')
const DEOPT_REASON_MACRO_RX = /V\(\s*([A-Za-z0-9_]+)\s*,\s*"((?:\\.|[^"\\])*)"/

function parseReasonAliases(header) {
  const aliases = Object.create(null)
  const expression = new RegExp(DEOPT_REASON_MACRO_RX.source, 'g')
  let match
  while ((match = expression.exec(header)) !== null) {
    const message = JSON.parse(`"${match[2]}"`)
    const existing = aliases[message]
    if (!existing) {
      aliases[message] = match[1]
    } else if (Array.isArray(existing)) {
      if (!existing.includes(match[1])) existing.push(match[1])
    } else if (existing !== match[1]) {
      aliases[message] = [existing, match[1]]
    }
  }
  if (Object.keys(aliases).length === 0) {
    throw new Error(`No deoptimization reasons found in ${headerPath}`)
  }
  return aliases
}

function fetchHeader(tag) {
  const url = `https://raw.githubusercontent.com/v8/v8/refs/tags/${tag}/${headerPath}`
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Failed to fetch ${url}: HTTP ${response.statusCode}`))
        return
      }
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    }).on('error', reject)
  })
}

async function main() {
  const result = Object.create(null)

  for (let major = firstMajor; major <= lastMajor; major++) {
    const tag = `${major}.0.1`
    const header = cachedHeadersDir
      ? fs.readFileSync(path.join(cachedHeadersDir, `v8-deoptimize-reason-${tag}.h`), 'utf8')
      : await fetchHeader(tag)
    result[major] = parseReasonAliases(header)
    process.stdout.write(`V8 ${major}: ${tag}, ${Object.keys(result[major]).length} aliases\n`)
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`Wrote ${outputPath}\n`)
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
})
