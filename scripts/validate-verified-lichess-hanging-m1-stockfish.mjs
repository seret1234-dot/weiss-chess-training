import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { once } from 'node:events'
import { Chess } from 'chess.js'

const root = process.cwd(), local = path.join(root, '.local-verified-lichess-tactics-v1')
const poolPath = path.join(local, 'hanging-m1-stockfish-v1-pool.json')
const output = path.join(local, 'hanging-m1-stockfish-v1-results.ndjson'), checkpoint = path.join(local, 'hanging-m1-stockfish-v1-checkpoint.json'), lock = path.join(local, 'hanging-m1-stockfish-v1.lock')
const config = Object.freeze({ name: 'Stockfish 18', threads: 1, hashMb: 64, multiPv: 3, depth: 14, closeDepth: 16, timeCutoff: false })
const resume = process.argv.includes('--resume')
const parseUci = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })
const finalNewline = (file) => { const stat = fs.statSync(file); if (!stat.size) return true; const fd = fs.openSync(file, 'r'), byte = Buffer.alloc(1); try { fs.readSync(fd, byte, 0, 1, stat.size - 1) } finally { fs.closeSync(fd) }; return byte[0] === 10 }
const atomic = (file, value) => { const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`); let failure; for (let i=0;i<10;i+=1) { try { fs.renameSync(temp, file); return } catch (error) { failure=error; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,150*(i+1)) } } throw failure }
async function append(stream, value) { if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, 'drain') }

class Engine {
  constructor() { this.buffer = ''; this.proc = null }
  send(command) { this.proc.stdin.write(`${command}\n`) }
  async until(token) { while (!this.buffer.includes(token)) await new Promise((resolve) => setTimeout(resolve, 5)); const out=this.buffer; this.buffer=''; return out }
  async init() {
    this.proc = spawn(process.execPath, [path.join(root, 'node_modules', 'stockfish', 'bin', 'stockfish-18-single.js')], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc.stdout.on('data', (chunk) => { this.buffer += chunk.toString() }); this.proc.stderr.on('data', () => {})
    this.send('uci'); await this.until('uciok'); this.send(`setoption name Threads value ${config.threads}`); this.send(`setoption name Hash value ${config.hashMb}`); this.send(`setoption name MultiPV value ${config.multiPv}`); this.send('isready'); await this.until('readyok')
  }
  async evaluate(fen, depth, searchmove = null) {
    this.buffer=''; this.send('ucinewgame'); this.send(`position fen ${fen}`); this.send(`go depth ${depth}${searchmove ? ` searchmoves ${searchmove}` : ''}`)
    const out = await this.until('bestmove'), ranks = new Map()
    for (const match of out.matchAll(/info .*?multipv\s+(\d+).*?score\s+(cp|mate)\s+(-?\d+).*?\bpv\s+([^\r\n]+)/g)) ranks.set(Number(match[1]), { rank:Number(match[1]), scoreType:match[2], scoreValue:Number(match[3]), pv:match[4].trim().split(/\s+/) })
    const lines=[...ranks.values()].sort((a,b)=>a.rank-b.rank), bestMove=out.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1] ?? null
    return { depth, bestMove, lines }
  }
  quit() { this.send('quit') }
}
const score = (line) => !line ? null : line.scoreType === 'mate' ? Math.sign(line.scoreValue) * 100000 : line.scoreValue
async function validate(engine, record) {
  const source = record.source, candidate = record.candidate, learner = new Chess(source.displayedFen).turn(), move = candidate.evidence.learnerMove
  const root = await engine.evaluate(source.displayedFen, config.depth), forced = await engine.evaluate(source.displayedFen, config.depth, move)
  const rootScore = score(root.lines[0]), forcedScore = score(forced.lines[0]), gap = rootScore == null || forcedScore == null ? null : rootScore - forcedScore
  const close = gap != null && Math.abs(gap - 100) <= 35
  const refined = close ? { root: await engine.evaluate(source.displayedFen, config.closeDepth), forced: await engine.evaluate(source.displayedFen, config.closeDepth, move) } : null
  const finalRoot = refined ? score(refined.root.lines[0]) : rootScore, finalForced = refined ? score(refined.forced.lines[0]) : forcedScore, finalGap = finalRoot == null || finalForced == null ? null : finalRoot - finalForced
  const approved = finalForced != null && finalForced >= 100 && finalGap != null && finalGap <= 100
  const status = approved ? 'APPROVED' : finalForced == null || finalGap == null ? 'UNRESOLVED' : finalForced < 100 ? 'REJECTED' : 'REJECTED'
  const reason = approved ? 'forced learner capture remains materially favorable and within 100cp of the deterministic best root move' : finalForced == null || finalGap == null ? 'engine did not provide a stable score' : finalForced < 100 ? 'capture is not at least a pawn favorable against best defense' : 'a clearly stronger root move makes the isolated loose-piece lesson misleading'
  return { sourcePuzzleId: source.sourcePuzzleId, learner, candidate: { subtype:candidate.evidence.subtype, learnerMove:move, target:candidate.evidence.targetPiece, targetSquare:candidate.evidence.targetSquare }, status, reason, root, forced, refined, rootScore:finalRoot, forcedScore:finalForced, scoreGap:finalGap, config }
}
async function main() {
  if (fs.existsSync(lock)) throw new Error('Hanging Piece Stockfish writer lock exists')
  const pool = JSON.parse(fs.readFileSync(poolPath, 'utf8')), existing = resume && fs.existsSync(output) ? fs.readFileSync(output,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse) : []
  if (existing.length && !finalNewline(output)) throw new Error('Stockfish output has truncated final line')
  const done = new Set(existing.map((row) => row.sourcePuzzleId)); if (done.size !== existing.length) throw new Error('duplicate Stockfish source IDs')
  const jobs = pool.jobs.filter((record) => !done.has(record.source.sourcePuzzleId)); if (existing.length && !fs.existsSync(checkpoint)) throw new Error('Stockfish output without checkpoint')
  fs.writeFileSync(lock, `${process.pid}\n`); const started = Date.now()
  try {
    const engine = new Engine(); await engine.init(); const writer=fs.createWriteStream(output,{flags:existing.length?'a':'w'}); let processed=0
    for (const job of jobs) { await append(writer, await validate(engine, job)); processed+=1; if (processed % 5 === 0) atomic(checkpoint,{ pipeline:'verified-lichess-hanging-m1-stockfish-v1', config, totalJobs:pool.uniqueJobs, processed:existing.length+processed, complete:false, elapsedMs:Date.now()-started }) }
    engine.quit(); await new Promise((resolve)=>writer.end(resolve)); const total=existing.length+processed
    atomic(checkpoint,{ pipeline:'verified-lichess-hanging-m1-stockfish-v1', config, totalJobs:pool.uniqueJobs, processed:total, complete:total===pool.uniqueJobs, elapsedMs:Date.now()-started, finalNewline:finalNewline(output) })
    console.log(JSON.stringify({ total, complete:total===pool.uniqueJobs, elapsedMs:Date.now()-started, config },null,2))
  } finally { fs.rmSync(lock,{force:true}) }
}
main().catch((error)=>{ console.error(error.stack||error.message); process.exitCode=1 })
