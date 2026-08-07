import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { classifyHangingM1 } from './lib/verified-lichess-hanging-m1.mjs'

const root = process.cwd(), local = path.join(root, '.local-verified-lichess-tactics-v1')
const indexPath = path.join(local, 'master-source-index-v1.ndjson'), metadataPath = path.join(local, 'master-source-metadata-v1.ndjson')
const output = path.join(local, 'hanging-m1-structural-v1.ndjson'), checkpoint = path.join(local, 'hanging-m1-structural-v1-checkpoint.json'), report = path.join(local, 'hanging-m1-structural-v1-report.json'), errors = path.join(local, 'hanging-m1-structural-v1-errors.ndjson'), lock = path.join(local, 'hanging-m1-structural-v1.lock')
const TOTAL = 5751400, resume = process.argv.includes('--resume')
const add = (object, key) => { object[key] = (object[key] ?? 0) + 1 }
const atomic = (file, value) => { const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`); let failure; for (let attempt = 0; attempt < 10; attempt += 1) { try { fs.renameSync(temp, file); return } catch (error) { failure = error; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150 * (attempt + 1)) } } throw failure }
const fresh = () => ({ pipeline: 'verified-lichess-hanging-m1-structural-v1', sourceRowsRead: 0, m1Positions: 0, learnerCaptures: 0, emitted: 0, statuses: {}, reasons: {}, subtypes: {}, checking: 0, nonChecking: 0, targets: {}, capturers: {}, families: new Set(), ratings: [], sourceTagOverlaps: {}, complete: false, errors: 0 })
const percentile = (values) => { const s = [...values].sort((a,b)=>a-b), at = (p) => s.length ? s[Math.round((s.length-1)*p)] : null; return { min:s[0]??null,p10:at(.1),p25:at(.25),median:at(.5),p75:at(.75),p90:at(.9),max:s.at(-1)??null } }
const checkpointState = (state) => ({ ...state, families: [...state.families] })
const reportState = (state) => { const { families, ratings, ...value } = state; return { ...value, exactSymmetryFamilies: families.size, rating: percentile(ratings) } }
const outputLines = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).length : 0
const outputFinalNewline = (file) => { const size = fs.statSync(file).size; if (!size) return true; const fd = fs.openSync(file, 'r'), byte = Buffer.alloc(1); try { fs.readSync(fd, byte, 0, 1, size - 1) } finally { fs.closeSync(fd) }; return byte[0] === 10 }
const flush = (stream) => new Promise((resolve, reject) => stream.write('', (error) => error ? reject(error) : resolve()))
async function main() {
  if (fs.existsSync(lock)) throw new Error('Hanging M1 writer lock exists')
  if (resume && (fs.existsSync(output) !== fs.existsSync(checkpoint))) throw new Error('Hanging M1 checkpoint/output mismatch')
  if (!resume && [output, checkpoint, report, errors].some(fs.existsSync)) throw new Error('Hanging M1 artifacts exist; use --resume')
  const prior = resume && fs.existsSync(checkpoint) ? JSON.parse(fs.readFileSync(checkpoint, 'utf8')) : null
  const state = prior ? { ...prior, families: new Set(prior.families ?? []), ratings: prior.ratings ?? [] } : fresh()
  if (prior && (!outputFinalNewline(output) || outputLines(output) !== state.emitted)) throw new Error('Hanging M1 durable output/checkpoint mismatch')
  fs.writeFileSync(lock, `${process.pid}\n`)
  try {
    const writer = fs.createWriteStream(output, { flags: prior ? 'a' : 'w' }), failures = fs.createWriteStream(errors, { flags: prior ? 'a' : 'w' })
    const indexLines = readline.createInterface({ input: fs.createReadStream(indexPath), crlfDelay: Infinity })
    const metadataLines = readline.createInterface({ input: fs.createReadStream(metadataPath), crlfDelay: Infinity })
    const metadataIterator = metadataLines[Symbol.asyncIterator]()
    let row = 0
    for await (const line of indexLines) {
      if (!line) continue
      const next = await metadataIterator.next(); if (next.done) throw new Error(`metadata ended before index at row ${row + 1}`)
      row += 1
      const source = JSON.parse(line), metadata = JSON.parse(next.value)
      if (source.sourcePuzzleId !== metadata.sourcePuzzleId || metadata.sourceRowNumber !== row) throw new Error(`source-layer parity failure at row ${row}`)
      if (row <= state.sourceRowsRead) continue
      state.sourceRowsRead = row
      if (source.sourceStage !== 1) continue
      state.m1Positions += 1
      try {
        const candidate = classifyHangingM1({ ...source, ...metadata, sourceM2Line: source.moves.slice(1) })
        if (!candidate.reason?.includes('not a non-king capture')) state.learnerCaptures += 1
        add(state.statuses, candidate.status); add(state.reasons, candidate.reason)
        if (candidate.evidence) {
          add(state.subtypes, candidate.evidence.subtype); add(state.targets, candidate.evidence.targetPiece); add(state.capturers, candidate.evidence.attackerPiece)
          candidate.evidence.givesCheck ? state.checking++ : state.nonChecking++
          for (const tag of candidate.evidence.sourceTags) add(state.sourceTagOverlaps, tag)
          if (candidate.exactSymmetryFamilyId) state.families.add(candidate.exactSymmetryFamilyId)
          if (Number.isFinite(source.rating)) state.ratings.push(source.rating)
        }
        if (candidate.status !== 'REJECTED') { writer.write(`${JSON.stringify({ source: { ...source, ...metadata, sourceM2Line: source.moves.slice(1) }, candidate })}\n`); state.emitted += 1 }
      } catch (error) { state.errors += 1; failures.write(`${JSON.stringify({ sourcePuzzleId: source.sourcePuzzleId, row, error: error.message })}\n`) }
      if (row % 10000 === 0) { await flush(writer); atomic(checkpoint, checkpointState(state)) }
    }
    const finalMetadata = await metadataIterator.next(); if (!finalMetadata.done) throw new Error('metadata contains records beyond master index')
    await Promise.all([new Promise((resolve) => writer.end(resolve)), new Promise((resolve) => failures.end(resolve))])
    if (row !== TOTAL || state.m1Positions !== 829877) throw new Error(`unexpected source/M1 counts ${row}/${state.m1Positions}`)
    state.complete = true; atomic(checkpoint, checkpointState(state)); atomic(report, reportState(state)); console.log(JSON.stringify(reportState(state), null, 2))
  } finally { fs.rmSync(lock, { force: true }) }
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
