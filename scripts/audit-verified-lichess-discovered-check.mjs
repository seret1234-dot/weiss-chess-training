import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { classifyDiscoveredCheck } from './lib/verified-lichess-discovered-check.mjs'

const root = process.cwd()
const input = path.join(root, 'audit-reports/verified-lichess-tactics-v1/atomic-m2-structural-v2.ndjson')
const local = path.join(root, '.local-verified-lichess-tactics-v1')
const output = path.join(local, 'discovered-check-causal-v1.ndjson')
const report = path.join(local, 'discovered-check-causal-v1-report.json')
const lock = path.join(local, 'discovered-check-causal-v1.lock')
const add = (object, key) => { object[key] = (object[key] ?? 0) + 1 }

if (fs.existsSync(lock)) throw new Error('Discovered Check writer lock exists')
if ([output, report].some(fs.existsSync)) throw new Error('accepted Discovered Check output exists; do not overwrite it')
fs.writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' })
try {
  const state = { pipeline: 'discovered-check-causal-v1', input: 0, candidates: 0, dispositions: {}, stages: {}, samples: {}, errors: 0, complete: false }
  const writer = fs.createWriteStream(output)
  const source = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity })
  for await (const line of source) {
    if (!line) continue
    state.input += 1
    const record = JSON.parse(line)
    let audit
    try { audit = classifyDiscoveredCheck(record) } catch (error) { state.errors += 1; audit = { disposition: 'INVALID_GEOMETRY', reason: error.message } }
    if (!audit) continue
    state.candidates += 1
    add(state.dispositions, audit.disposition)
    if (audit.stage) add(state.stages, audit.stage)
    const key = audit.disposition
    const sample = state.samples[key] ?? (state.samples[key] = [])
    if (sample.length < 100) sample.push({ sourcePuzzleId: record.sourcePuzzleId, displayedFen: record.displayedFen, rating: record.rating, line: record.sourceM2Line, ...audit })
    writer.write(`${JSON.stringify({ sourcePuzzleId: record.sourcePuzzleId, canonicalIdentity: record.canonicalIdentity, displayedFen: record.displayedFen, rating: record.rating, sourceM2Line: record.sourceM2Line, audit })}\n`)
  }
  await new Promise(resolve => writer.end(resolve))
  state.complete = true
  fs.writeFileSync(report, `${JSON.stringify(state, null, 2)}\n`)
  console.log(JSON.stringify(state, null, 2))
} finally { fs.rmSync(lock, { force: true }) }
