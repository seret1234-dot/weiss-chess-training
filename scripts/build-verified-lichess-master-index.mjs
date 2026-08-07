import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { once } from 'node:events'
import { parse } from 'csv-parse'
import { Chess } from 'chess.js'
import { CSV_COLUMNS, actualStage, parseMoves } from './lib/verified-lichess-csv.mjs'

const root = process.cwd(), local = path.join(root, '.local-verified-lichess-tactics-v1')
const csvPath = 'C:/Users/Ariel/chess-trainer/lichess_db_puzzle.csv'
const output = path.join(local, 'master-source-index-v1.ndjson')
const checkpoint = path.join(local, 'master-source-index-v1-checkpoint.json')
const report = path.join(local, 'master-source-index-v1-report.json')
const errors = path.join(local, 'master-source-index-v1-errors.ndjson')
const lock = path.join(local, 'master-source-index-v1.lock')
const resume = process.argv.includes('--resume')
const limitFlag = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitFlag ? Number(limitFlag.slice('--limit='.length)) : null
const TOTAL_ROWS = 5751400
const asMove = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })

function fingerprint() { const stat = fs.statSync(csvPath); return crypto.createHash('sha256').update(`${stat.size}:${stat.mtimeMs}`).digest('hex') }
function atomic(file, value) {
  const temporary = `${file}.${process.pid}.tmp`
  fs.rmSync(temporary, { force: true })
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  let failure = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { fs.renameSync(temporary, file); return } catch (error) { failure = error; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150 * (attempt + 1)) }
  }
  throw failure
}
async function write(stream, line) { if (!stream.write(`${JSON.stringify(line)}\n`)) await once(stream, 'drain') }
function stateFor(sourceFingerprint) { return { pipeline: 'verified-lichess-master-source-index-v1', sourceFingerprint, sourceRowsExpected: TOTAL_ROWS, sourceRowsRead: 0, emitted: 0, legal: 0, invalid: 0, replayFailures: {}, complete: false, resumed: false, indexFields: ['sourcePuzzleId', 'sourceFen', 'moves', 'displayedFen', 'rating', 'rawLichessTags', 'sourceStage', 'legal', 'sourceGameUrl'] } }
function add(object, key) { object[key] = (object[key] ?? 0) + 1 }
function validate(row) {
  const moves = parseMoves(row.Moves)
  const board = new Chess(row.FEN)
  if (!moves.length) throw new Error('empty move line')
  const displayed = new Chess(row.FEN)
  if (!displayed.move(asMove(moves[0]))) throw new Error('illegal pre-move')
  for (const uci of moves) if (!board.move(asMove(uci))) throw new Error(`illegal full-line move: ${uci}`)
  return { sourcePuzzleId: row.PuzzleId, sourceFen: row.FEN, moves, displayedFen: displayed.fen(), rating: Number(row.Rating), rawLichessTags: String(row.Themes ?? '').trim().split(/\s+/).filter(Boolean), sourceStage: actualStage(moves), legal: true, sourceGameUrl: row.GameUrl }
}
function verifyResume(state) {
  if (!fs.existsSync(output)) return
  const stat = fs.statSync(output)
  if (stat.size) { const handle = fs.openSync(output, 'r'), byte = Buffer.alloc(1); try { fs.readSync(handle, byte, 0, 1, stat.size - 1) } finally { fs.closeSync(handle) }; if (byte[0] !== 10) throw new Error('master index has truncated final line') }
  let durable = 0
  for (const _ of fs.readFileSync(output, 'utf8').split(/\r?\n/)) if (_) durable += 1
  if (durable !== state.emitted) throw new Error(`master index checkpoint/output mismatch: ${durable} durable, ${state.emitted} checkpoint`)
}
async function main() {
  if (fs.existsSync(lock)) throw new Error('master-index writer lock exists')
  const before = fingerprint()
  const prior = resume && fs.existsSync(checkpoint) ? JSON.parse(fs.readFileSync(checkpoint, 'utf8')) : null
  if (prior && prior.sourceFingerprint !== before) throw new Error('source fingerprint changed; refusing resume')
  if (!resume && [output, checkpoint, report, errors].some(fs.existsSync)) throw new Error('master-index artifacts exist; use --resume')
  if (resume && fs.existsSync(output) !== fs.existsSync(checkpoint)) throw new Error('master-index checkpoint/output mismatch')
  const state = prior ?? stateFor(before); state.resumed = Boolean(prior)
  if (prior) verifyResume(state)
  fs.writeFileSync(lock, `${process.pid}\n`)
  try {
    const outputStream = fs.createWriteStream(output, { flags: prior ? 'a' : 'w' }), errorStream = fs.createWriteStream(errors, { flags: prior ? 'a' : 'w' })
    const parser = parse({ columns: CSV_COLUMNS, from_line: 2, bom: true })
    fs.createReadStream(csvPath).pipe(parser)
    let rowIndex = 0
    for await (const row of parser) {
      rowIndex += 1
      if (rowIndex <= state.sourceRowsRead) continue
      if (limit && rowIndex > limit) break
      state.sourceRowsRead = rowIndex
      try { await write(outputStream, validate(row)); state.legal += 1 } catch (error) { state.invalid += 1; add(state.replayFailures, error.message); await write(errorStream, { sourcePuzzleId: row.PuzzleId, legal: false, reason: error.message }) }
      state.emitted += 1
      if (rowIndex % 10000 === 0) atomic(checkpoint, state)
    }
    await Promise.all([new Promise((resolve, reject) => { outputStream.on('error', reject); outputStream.end(resolve) }), new Promise((resolve, reject) => { errorStream.on('error', reject); errorStream.end(resolve) })])
    const after = fingerprint(); if (before !== after) throw new Error('source fingerprint changed during scan')
    state.complete = !limit && state.sourceRowsRead === TOTAL_ROWS
    atomic(checkpoint, state); atomic(report, state); console.log(JSON.stringify(state, null, 2))
  } finally { fs.rmSync(lock, { force: true }) }
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
