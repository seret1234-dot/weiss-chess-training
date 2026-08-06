import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Chess } from 'chess.js'
import { replayTrace } from './lib/verified-lichess-replay-trace.mjs'

const root = process.cwd(), local = path.join(root, '.local-verified-lichess-tactics-v1')
const poolPath = path.join(local, 'b2-v5-engine-pool.json')
const outputPath = path.join(local, 'b2-v5-stockfish-results.ndjson')
const checkpointPath = path.join(local, 'b2-v5-stockfish-checkpoint.json')
const lockPath = path.join(local, 'b2-v5-stockfish.lock')
const config = Object.freeze({ name: 'Stockfish 18', threads: 1, hashMb: 64, multiPv: 3, depth: 14, closeDepth: 16, timeCutoff: false })
const resume = process.argv.includes('--resume')
const asMove = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })
const atomic = (file, value) => { const temporary = `${file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(temporary, file) }

class Engine {
  constructor() { this.buffer = ''; this.proc = null }
  send(command) { this.proc.stdin.write(`${command}\n`) }
  async waitFor(token) { while (!this.buffer.includes(token)) await new Promise((resolve) => setTimeout(resolve, 5)); const value = this.buffer; this.buffer = ''; return value }
  async init() {
    this.proc = spawn(process.execPath, [path.join(root, 'node_modules', 'stockfish', 'bin', 'stockfish-18-single.js')], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc.stdout.on('data', (data) => { this.buffer += data.toString() }); this.proc.stderr.on('data', () => {})
    this.send('uci'); await this.waitFor('uciok')
    this.send(`setoption name Threads value ${config.threads}`); this.send(`setoption name Hash value ${config.hashMb}`); this.send(`setoption name MultiPV value ${config.multiPv}`); this.send('setoption name UCI_LimitStrength value false'); this.send('isready'); await this.waitFor('readyok')
  }
  async evaluate(fen, depth, searchMoves = []) {
    this.buffer = ''; this.send('ucinewgame'); this.send(`position fen ${fen}`); this.send(`go depth ${depth}${searchMoves.length ? ` searchmoves ${searchMoves.join(' ')}` : ''}`)
    const output = await this.waitFor('bestmove'), lines = new Map()
    for (const match of output.matchAll(/info .*?multipv\s+(\d+).*?score\s+(cp|mate)\s+(-?\d+).*?\bpv\s+([^\r\n]+)/g)) lines.set(Number(match[1]), { rank: Number(match[1]), scoreType: match[2], scoreValue: Number(match[3]), pv: match[4].trim().split(/\s+/).filter(Boolean) })
    return { depth, bestMove: output.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1] ?? null, lines: [...lines.values()].sort((left, right) => left.rank - right.rank) }
  }
  quit() { this.send('quit') }
}

const scoreFor = (evaluation, fen, learner) => {
  const line = evaluation.lines[0]; if (!line) return null
  const native = line.scoreType === 'mate' ? Math.sign(line.scoreValue) * 100000 : line.scoreValue
  return new Chess(fen).turn() === learner ? native : -native
}
const play = (fen, uci) => { const game = new Chess(fen), move = game.move(asMove(uci)); if (!move) throw new Error(`illegal forced move ${uci}`); return game.fen() }
const routineRecaptures = (source, square) => new Chess(source.displayedFen).moves({ verbose: true }).filter((move) => move.to === square && move.captured).map((move) => `${move.from}${move.to}${move.promotion ?? ''}`)
const isMateWin = (score) => score != null && score >= 90000

async function compareAtDepth(engine, source, finding, depth) {
  const trace = replayTrace(source.sourceFen, [source.preMove, ...source.sourceM2Line]), learner = new Chess(source.displayedFen).turn()
  const insertedMove = source.sourceM2Line[0], routines = routineRecaptures(source, finding.evidence.recaptureSquare)
  if (!routines.length) throw new Error('structural routine recaptures disappeared')
  const root = await engine.evaluate(source.displayedFen, depth)
  const insertedFen = play(source.displayedFen, insertedMove), insertedEval = await engine.evaluate(insertedFen, depth)
  const routine = []
  for (const move of routines) { const fen = play(source.displayedFen, move); const evaluation = await engine.evaluate(fen, depth); routine.push({ move, evaluation, learnerScore: scoreFor(evaluation, fen, learner) }) }
  const response = source.sourceM2Line[1] ?? null
  const responseCandidates = insertedEval.lines.map((line) => line.pv[0]).filter(Boolean)
  const insertedScore = scoreFor(insertedEval, insertedFen, learner)
  const deltas = routine.map((item) => ({ move: item.move, delta: insertedScore == null || item.learnerScore == null ? null : insertedScore - item.learnerScore, routineScore: item.learnerScore }))
  const alternativeRootMoves = root.lines.map((line) => ({ move: line.pv[0], learnerScore: scoreFor({ lines: [line] }, source.displayedFen, learner) })).filter((line) => line.move && line.move !== insertedMove)
  const traceReplay = trace.length === 1 + source.sourceM2Line.length
  return { depth, learner, insertedMove, routines, root, insertedEval, insertedScore, routine, deltas, storedResponse: response, responseCandidates, responseCredible: response ? responseCandidates.includes(response) : false, alternativeRootMoves, traceReplay }
}

function decision(comparison) {
  if (!comparison.traceReplay || !comparison.responseCredible) return { status: 'REJECTED', reason: comparison.traceReplay ? 'stored opponent response is absent from fixed MultiPV best-defense candidates' : 'stored continuation replay failed' }
  if (comparison.insertedScore == null || comparison.deltas.some((delta) => delta.delta == null)) return { status: 'UNRESOLVED', reason: 'engine did not provide a comparable forced-root score' }
  const smallest = Math.min(...comparison.deltas.map((delta) => delta.delta))
  const equivalentAlternative = comparison.alternativeRootMoves.some((alternative) => alternative.learnerScore != null && Math.abs(alternative.learnerScore - comparison.insertedScore) < 50)
  if (equivalentAlternative) return { status: 'UNRESOLVED', reason: 'materially equivalent non-stored root alternative requires semantic review' }
  if (smallest <= 0) return { status: 'REJECTED', reason: 'at least one immediate routine recapture is equal or better' }
  if (smallest < 100 && !comparison.deltas.every((delta) => isMateWin(comparison.insertedScore) && !isMateWin(delta.routineScore))) return { status: 'UNRESOLVED', reason: 'superiority margin is below 100cp at fixed depth' }
  return { status: 'APPROVED', reason: isMateWin(comparison.insertedScore) ? 'inserted move forces mate over every immediate routine recapture' : 'inserted move is at least 100cp superior to every immediate routine recapture' }
}

async function validate(engine, job) {
  const first = await compareAtDepth(engine, job.source, job.finding, config.depth); let verdict = decision(first); let second = null
  const close = verdict.status === 'UNRESOLVED' && /margin|comparable/.test(verdict.reason)
  if (close) { second = await compareAtDepth(engine, job.source, job.finding, config.closeDepth); verdict = decision(second) }
  return { sourcePuzzleId: job.source.sourcePuzzleId, course: job.course, selection: job.selection, source: job.source, finding: job.finding, status: verdict.status, reason: verdict.reason, depth14: first, depth16: second, engineConfiguration: config }
}

async function existing() {
  const rows = [], seen = new Set(); if (!resume || !fs.existsSync(outputPath)) return { rows, seen }
  const text = fs.readFileSync(outputPath, 'utf8'); if (text && !text.endsWith('\n')) throw new Error('refusing resume: truncated engine result output')
  for (const line of text.split(/\r?\n/)) { if (!line) continue; const row = JSON.parse(line); if (seen.has(row.sourcePuzzleId)) throw new Error(`duplicate engine job ${row.sourcePuzzleId}`); seen.add(row.sourcePuzzleId); rows.push(row) }
  return { rows, seen }
}

async function main() {
  const pool = JSON.parse(fs.readFileSync(poolPath, 'utf8')), jobs = []
  for (const [course, value] of Object.entries(pool.courses)) for (const selection of ['primary', 'reserve']) for (const candidate of value[selection]) jobs.push({ ...candidate, course, selection })
  const prior = await existing(); if (new Set(jobs.map((job) => job.source.sourcePuzzleId)).size !== jobs.length) throw new Error('pool violates source-ID deduplication')
  const lock = fs.openSync(lockPath, 'wx'); fs.writeFileSync(lock, `${process.pid}\n`)
  const writer = fs.createWriteStream(outputPath, { flags: prior.rows.length ? 'a' : 'w' }), engine = new Engine(), started = Date.now(); let processed = 0
  try {
    await engine.init()
    for (const job of jobs) {
      if (prior.seen.has(job.source.sourcePuzzleId)) continue
      const result = await validate(engine, job); writer.write(`${JSON.stringify(result)}\n`); processed += 1
      if (processed % 2 === 0) atomic(checkpointPath, { version: 'b2-v5-stockfish-v1', config, totalJobs: jobs.length, processed: prior.rows.length + processed, complete: false, elapsedMs: Date.now() - started })
    }
    await new Promise((resolve) => writer.end(resolve)); const total = prior.rows.length + processed
    atomic(checkpointPath, { version: 'b2-v5-stockfish-v1', config, totalJobs: jobs.length, processed: total, complete: total === jobs.length, elapsedMs: Date.now() - started })
    console.log(JSON.stringify({ totalJobs: jobs.length, processed: total, complete: total === jobs.length }, null, 2))
  } finally { engine.quit(); fs.closeSync(lock); if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath) }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
