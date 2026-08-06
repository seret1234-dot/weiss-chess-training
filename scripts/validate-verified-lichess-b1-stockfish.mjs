import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Chess } from 'chess.js'

const root = process.cwd(), audit = path.join(root, 'audit-reports/verified-lichess-tactics-v1')
const localOutput = path.join(root, '.local-verified-lichess-tactics-v1')
const poolPath = path.join(audit, 'exhaustive-b1-validation-pool.json')
// The archival audit directory is locked by another local Windows process. Keep
// the resumable engine artifacts local and untracked without touching that data.
fs.mkdirSync(localOutput, { recursive: true })
const outputPath = path.join(localOutput, 'b1-stockfish-v2-results.ndjson')
const checkpointPath = path.join(localOutput, 'b1-stockfish-v2-checkpoint.json')
const config = Object.freeze({ name: 'Stockfish 18', threads: 1, hashMb: 64, multiPv: 3, depth: 14, underpromotionDepths: [12, 14], timeCutoff: false })
const benchmarkOnly = process.argv.includes('--benchmark')
const resume = process.argv.includes('--resume')
const parseMove = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })

class Engine {
  constructor() { this.buffer = ''; this.proc = null }
  send(command) { this.proc.stdin.write(`${command}\n`) }
  async waitFor(token) { while (!this.buffer.includes(token)) await new Promise((resolve) => setTimeout(resolve, 5)); const output = this.buffer; this.buffer = ''; return output }
  async init() {
    const runner = path.join(root, 'node_modules', 'stockfish', 'bin', 'stockfish-18-single.js')
    this.proc = spawn(process.execPath, [runner], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc.stdout.on('data', (data) => { this.buffer += data.toString() })
    this.proc.stderr.on('data', () => {})
    this.send('uci'); await this.waitFor('uciok')
    this.send(`setoption name Threads value ${config.threads}`); this.send(`setoption name Hash value ${config.hashMb}`); this.send(`setoption name MultiPV value ${config.multiPv}`); this.send('setoption name UCI_LimitStrength value false'); this.send('isready'); await this.waitFor('readyok')
  }
  async evaluate(fen, depth = config.depth) {
    this.buffer = ''; this.send('ucinewgame'); this.send(`position fen ${fen}`); this.send(`go depth ${depth}`)
    const output = await this.waitFor('bestmove')
    const finalByRank = new Map()
    for (const match of output.matchAll(/info .*?multipv\s+(\d+).*?score\s+(cp|mate)\s+(-?\d+).*?\bpv\s+([^\r\n]+)/g)) {
      finalByRank.set(Number(match[1]), { rank: Number(match[1]), scoreType: match[2], scoreValue: Number(match[3]), pv: match[4].trim().split(/\s+/).filter(Boolean) })
    }
    const lines = [...finalByRank.values()]
    const bestMove = output.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1] ?? null
    return { depth, bestMove, lines: lines.sort((a, b) => a.rank - b.rank) }
  }
  quit() { this.send('quit') }
}
const attackerScore = (evaluation, fen, attacker) => {
  const line = evaluation.lines[0]
  if (!line) return null
  const native = line.scoreType === 'mate' ? Math.sign(line.scoreValue) * 100000 : line.scoreValue
  const white = new Chess(fen).turn() === 'w' ? native : -native
  return attacker === 'w' ? white : -white
}
function replay(source) {
  const game = new Chess(source.displayedFen), attacker = game.turn(), states = []
  for (let index = 0; index < source.sourceM2Line.length; index += 1) {
    const before = game.fen(), uci = source.sourceM2Line[index], move = game.move(parseMove(uci))
    if (!move) throw new Error(`illegal stored learner line at ply ${index + 1}`)
    states.push({ before, after: game.fen(), uci, move, attackerMove: move.color === attacker })
  }
  return { attacker, states }
}
async function validateFinding(engine, source, finding) {
  const { attacker, states } = replay(source)
  const root = await engine.evaluate(source.displayedFen)
  const first = states[0]
  const rootMoves = root.lines.map((line) => line.pv[0]).filter(Boolean)
  const storedFirstInMultiPv = rootMoves.includes(first.uci)
  const learnerAnalyses = []
  for (const state of states.filter((state) => state.attackerMove)) learnerAnalyses.push({ uci: state.uci, after: await engine.evaluate(state.after) })
  const replyChecks = []
  for (let index = 1; index < states.length; index += 2) {
    const preceding = learnerAnalyses.find((entry) => entry.uci === states[index - 1].uci)
    const choices = preceding?.after.lines.map((line) => line.pv[0]).filter(Boolean) ?? []
    replyChecks.push({ reply: states[index].uci, inMultiPv: choices.includes(states[index].uci), choices })
  }
  const poorDefense = replyChecks.some((reply) => !reply.inMultiPv)
  let underpromotion = null
  if (finding.candidateCategory === 'underpromotion') {
    const promotionState = states.find((state) => state.uci === finding.evidence.promotionMove)
    const comparisons = []
    for (const depth of config.underpromotionDepths) {
      const scores = {}
      for (const promotion of ['q', 'r', 'b', 'n']) {
        const game = new Chess(promotionState.before)
        const move = game.move({ from: promotionState.move.from, to: promotionState.move.to, promotion })
        if (move) scores[promotion] = attackerScore(await engine.evaluate(game.fen(), depth), game.fen(), attacker)
      }
      comparisons.push({ depth, scores })
    }
    const chosen = promotionState.move.promotion
    const stable = comparisons.every(({ scores }) => scores[chosen] != null && scores.q != null && scores[chosen] - scores.q >= 100)
    underpromotion = { chosen, comparisons, stable, classification: stable ? 'chosen promotion is stably at least 100cp better than queen' : 'unresolved at configured depths' }
  }
  const status = underpromotion && !underpromotion.stable ? 'UNRESOLVED' : !storedFirstInMultiPv ? 'REJECTED' : poorDefense ? 'REJECTED' : 'APPROVED'
  const reason = status === 'APPROVED' ? 'stored learner move and replies are within fixed MultiPV' : underpromotion && !underpromotion.stable ? underpromotion.classification : !storedFirstInMultiPv ? 'stored learner move is absent from root MultiPV' : 'stored opponent reply is absent from best-defense MultiPV'
  return { finding: { key: finding.key, label: finding.label, extraction: finding.extraction, status: finding.status, evidence: finding.evidence }, status, reason, root, storedFirstInMultiPv, learnerAnalyses, replyChecks, underpromotion }
}
async function main() {
  const pool = JSON.parse(fs.readFileSync(poolPath, 'utf8'))
  const prior = resume && fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) : null
  const existing = resume && fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse) : []
  const done = new Set(existing.map((entry) => entry.sourcePuzzleId))
  const jobs = pool.jobs.filter((job) => !done.has(job.source.sourcePuzzleId))
  const queue = benchmarkOnly ? jobs.slice(0, 8) : jobs
  const engine = new Engine(); await engine.init(); const started = Date.now()
  const output = fs.createWriteStream(outputPath, { flags: existing.length ? 'a' : 'w' }); let processed = 0
  for (const job of queue) {
    const findings = []
    for (const finding of job.findings) findings.push(await validateFinding(engine, job.source, finding))
    output.write(`${JSON.stringify({ sourcePuzzleId: job.source.sourcePuzzleId, source: job.source, findings, config })}\n`)
    processed += 1
    if (processed % 5 === 0) fs.writeFileSync(checkpointPath, `${JSON.stringify({ config, totalJobs: pool.uniqueEngineJobs, processed: existing.length + processed, benchmarkOnly, complete: false, elapsedMs: Date.now() - started }, null, 2)}\n`)
  }
  engine.quit(); await new Promise((resolve) => output.end(resolve))
  const total = existing.length + processed
  const checkpoint = { config, totalJobs: pool.uniqueEngineJobs, processed: total, benchmarkOnly, complete: !benchmarkOnly && total === pool.uniqueEngineJobs, elapsedMs: Date.now() - started }
  fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`)
  console.log(JSON.stringify(checkpoint, null, 2))
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
