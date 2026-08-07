import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { classifyDeflection } from './lib/verified-lichess-deflection.mjs'

const root = process.cwd(), local = path.join(root, '.local-verified-lichess-tactics-v1')
const input = path.join(root, 'audit-reports/verified-lichess-tactics-v1/atomic-m2-structural-v2.ndjson')
const output = path.join(local, 'deflection-causal-v2.ndjson'), report = path.join(local, 'deflection-causal-v2-report.json'), lock = path.join(local, 'deflection-causal-v2.lock')
const add = (o, k) => { o[k] = (o[k] ?? 0) + 1 }
if (fs.existsSync(lock)) throw new Error('Deflection writer lock exists')
if ([output, report].some(fs.existsSync)) throw new Error('accepted Deflection output exists; do not overwrite it')
fs.writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' })
try {
  const state = { pipeline: 'deflection-causal-v2', input: 0, candidates: 0, dispositions: {}, samples: {}, errors: 0, complete: false }
  const writer = fs.createWriteStream(output), source = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity })
  for await (const line of source) { if (!line) continue; state.input += 1; const record = JSON.parse(line); let audit; try { audit = classifyDeflection(record) } catch (error) { state.errors += 1; audit = { disposition: 'INVALID_GEOMETRY', reason: error.message } } if (!audit) continue; state.candidates += 1; add(state.dispositions, audit.disposition); const sample = state.samples[audit.disposition] ?? (state.samples[audit.disposition] = []); if (sample.length < 100) sample.push({ sourcePuzzleId: record.sourcePuzzleId, displayedFen: record.displayedFen, rating: record.rating, line: record.sourceM2Line, ...audit }); writer.write(`${JSON.stringify({ sourcePuzzleId: record.sourcePuzzleId, canonicalIdentity: record.canonicalIdentity, displayedFen: record.displayedFen, rating: record.rating, sourceM2Line: record.sourceM2Line, audit })}\n`) }
  await new Promise(resolve => writer.end(resolve)); state.complete = true; fs.writeFileSync(report, `${JSON.stringify(state, null, 2)}\n`); console.log(JSON.stringify(state, null, 2))
} finally { fs.rmSync(lock, { force: true }) }
