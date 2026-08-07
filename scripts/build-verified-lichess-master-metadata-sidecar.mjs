import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { once } from 'node:events'
import { parse } from 'csv-parse'
import { CSV_COLUMNS } from './lib/verified-lichess-csv.mjs'

// This deliberately does no chess reconstruction or replay.  It completes the
// reusable source layer with columns omitted from the legal master index.
const root = process.cwd()
const local = path.join(root, '.local-verified-lichess-tactics-v1')
const csvPath = 'C:/Users/Ariel/chess-trainer/lichess_db_puzzle.csv'
const indexPath = path.join(local, 'master-source-index-v1.ndjson')
const output = path.join(local, 'master-source-metadata-v1.ndjson')
const checkpoint = path.join(local, 'master-source-metadata-v1-checkpoint.json')
const report = path.join(local, 'master-source-metadata-v1-report.json')
const lock = path.join(local, 'master-source-metadata-v1.lock')
const TOTAL_ROWS = 5751400
const resume = process.argv.includes('--resume')
const limit = Number((process.argv.find((value) => value.startsWith('--limit=')) ?? '').slice(8)) || null

const fingerprint = () => {
  const stat = fs.statSync(csvPath)
  return crypto.createHash('sha256').update(`${stat.size}:${stat.mtimeMs}`).digest('hex')
}
const atomic = (file, value) => {
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  let failure = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { fs.renameSync(temporary, file); return } catch (error) {
      failure = error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150 * (attempt + 1))
    }
  }
  throw failure
}
const splitTags = (value) => String(value ?? '').trim().split(/\s+/).filter(Boolean)
const lineCount = (file) => {
  let count = 0
  const fd = fs.openSync(file, 'r')
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let read = 0
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null))) {
      for (let i = 0; i < read; i += 1) if (buffer[i] === 10) count += 1
    }
  } finally { fs.closeSync(fd) }
  return count
}
const finalNewline = (file) => {
  const stat = fs.statSync(file)
  if (!stat.size) return false
  const fd = fs.openSync(file, 'r'), byte = Buffer.alloc(1)
  try { fs.readSync(fd, byte, 0, 1, stat.size - 1) } finally { fs.closeSync(fd) }
  return byte[0] === 10
}
const fresh = (sourceFingerprint) => ({
  pipeline: 'verified-lichess-master-metadata-v1', schemaVersion: 1,
  sourceFingerprint, sourceRowsExpected: TOTAL_ROWS, sourceRowsRead: 0,
  emitted: 0, complete: false,
  sidecarFields: ['sourcePuzzleId', 'sourceRowNumber', 'ratingDeviation', 'popularity', 'nbPlays', 'openingTags'],
})
async function write(stream, value) { if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, 'drain') }
async function flush(stream) {
  await new Promise((resolve, reject) => stream.write('', (error) => error ? reject(error) : resolve()))
}
function assertResume(state) {
  if (!fs.existsSync(output)) throw new Error('metadata output missing for resume')
  if (!finalNewline(output)) throw new Error('metadata sidecar has truncated final line')
  const durable = lineCount(output)
  if (state.sourceRowsRead !== state.emitted || durable < state.emitted || durable > state.emitted + 10000) {
    throw new Error(`metadata checkpoint/output mismatch: ${durable}/${state.emitted}/${state.sourceRowsRead}`)
  }
  // A process can finish the next 10k output block after a checkpoint rename
  // loses a Windows handle race. Advance only to records proved durable in the
  // append-only output; never infer records from a checkpoint alone.
  if (durable > state.emitted) {
    state.sourceRowsRead = durable
    state.emitted = durable
    atomic(checkpoint, state)
  }
}
async function verifyAgainstIndex(state) {
  if (!finalNewline(output)) throw new Error('metadata sidecar final newline missing')
  const source = readline.createInterface({ input: fs.createReadStream(output), crlfDelay: Infinity })
  const index = readline.createInterface({ input: fs.createReadStream(indexPath), crlfDelay: Infinity })
  const indexIterator = index[Symbol.asyncIterator]()
  let rows = 0
  for await (const line of source) {
    if (!line) continue
    const next = await indexIterator.next()
    if (next.done) throw new Error(`metadata has extra row ${rows + 1} beyond master index`)
    const metadata = JSON.parse(line), indexed = JSON.parse(next.value)
    rows += 1
    if (metadata.sourceRowNumber !== rows) throw new Error(`sourceRowNumber is not monotonic at ${rows}`)
    if (metadata.sourcePuzzleId !== indexed.sourcePuzzleId) throw new Error(`metadata/master ID mismatch at row ${rows}`)
  }
  const final = await indexIterator.next()
  if (!final.done) throw new Error('metadata sidecar is missing records from master index')
  if (rows !== TOTAL_ROWS || rows !== state.emitted) throw new Error(`metadata row count mismatch: ${rows}`)
  return rows
}
async function main() {
  if (fs.existsSync(lock)) throw new Error('metadata-sidecar writer lock exists')
  const before = fingerprint()
  const prior = resume && fs.existsSync(checkpoint) ? JSON.parse(fs.readFileSync(checkpoint, 'utf8')) : null
  if (prior && prior.sourceFingerprint !== before) throw new Error('source fingerprint changed; refusing resume')
  if (resume && fs.existsSync(output) !== fs.existsSync(checkpoint)) throw new Error('metadata checkpoint/output mismatch')
  if (!resume && [output, checkpoint, report].some(fs.existsSync)) throw new Error('metadata artifacts exist; use --resume')
  const state = prior ?? fresh(before)
  if (prior) assertResume(state)
  fs.writeFileSync(lock, `${process.pid}\n`)
  try {
    const stream = fs.createWriteStream(output, { flags: prior ? 'a' : 'w' })
    const parser = parse({ columns: CSV_COLUMNS, from_line: 2, bom: true })
    fs.createReadStream(csvPath).pipe(parser)
    let rowNumber = 0
    for await (const row of parser) {
      rowNumber += 1
      if (rowNumber <= state.sourceRowsRead) continue
      if (limit && rowNumber > limit) break
      state.sourceRowsRead = rowNumber
      await write(stream, {
        sourcePuzzleId: row.PuzzleId,
        sourceRowNumber: rowNumber,
        ratingDeviation: Number(row.RatingDeviation),
        popularity: Number(row.Popularity),
        nbPlays: Number(row.NbPlays),
        openingTags: splitTags(row.OpeningTags),
      })
      state.emitted += 1
      // Do not make a checkpoint claim records that have not reached the
      // durable stream yet. This is what makes a forced stop resume-safe.
      if (rowNumber % 10000 === 0) { await flush(stream); atomic(checkpoint, state) }
    }
    await new Promise((resolve, reject) => { stream.on('error', reject); stream.end(resolve) })
    if (fingerprint() !== before) throw new Error('source fingerprint changed during metadata pass')
    state.complete = !limit && state.sourceRowsRead === TOTAL_ROWS
    if (state.complete) state.integrity = { verifiedRows: await verifyAgainstIndex(state), finalNewline: true, sourceRowNumberUniqueAndMonotonic: true, masterIndexParity: true }
    atomic(checkpoint, state); atomic(report, state)
    console.log(JSON.stringify(state, null, 2))
  } finally { fs.rmSync(lock, { force: true }) }
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
