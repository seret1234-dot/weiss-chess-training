import { spawn } from 'node:child_process'
import path from 'node:path'
import { Chess } from 'chess.js'
import { moveFromUci, normalizeUci, storedLine } from './pattern-tactic-semantic-validator.mjs'

export const BATCH1_THEMES = Object.freeze([
  'bishop-xray', 'queen-xray', 'rook-xray', 'other-xray',
  'hanging-piece', 'trapped-piece', 'remove-the-defender', 'attacking-f2-f7',
])

export const BATCH1_ENGINE = Object.freeze({
  name: 'Stockfish 18', depth: 14, threads: 1, hashMb: 64, timeCutoff: false,
})

export const BATCH1_STATUS = Object.freeze({
  VALID: 'VALID', AMBIGUOUS: 'AMBIGUOUS', MISCLASSIFIED: 'MISCLASSIFIED', BROKEN: 'BROKEN',
})

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const SLIDERS = new Set(['b', 'r', 'q'])
const directionsFor = (type) => type === 'b'
  ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
  : type === 'r'
    ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
    : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]

function square(x, y) {
  return x >= 0 && x < 8 && y >= 0 && y < 8 ? `${String.fromCharCode(97 + x)}${y + 1}` : null
}

function material(game, color) {
  return game.board().flat().reduce((sum, piece) => sum + (piece?.color === color ? VALUE[piece.type] : 0), 0)
}

function materialGain(beforeFen, afterFen, attacker) {
  return material(new Chess(afterFen), attacker) - material(new Chess(beforeFen), attacker)
}

function describe(piece, at) {
  const name = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[piece.type]
  return `${piece.color === 'w' ? 'White' : 'Black'} ${name} on ${at}`
}

function legalReplay(raw) {
  const game = new Chess(String(raw.fen ?? raw.FEN ?? ''))
  const preMove = normalizeUci(raw.preMove)
  if (preMove) {
    const applied = game.move(moveFromUci(preMove))
    if (!applied) throw new Error(`illegal preMove ${preMove}`)
  }
  const line = storedLine(raw)
  const activeLine = preMove && line[0] === preMove ? line.slice(1) : line
  if (!activeLine.length) throw new Error('missing stored solution')
  const startFen = game.fen()
  const moves = []
  for (const uci of activeLine) {
    const move = game.move(moveFromUci(uci))
    if (!move) throw new Error(`illegal stored solution move ${uci}`)
    moves.push(move)
  }
  const afterFirst = new Chess(startFen)
  afterFirst.move(moveFromUci(activeLine[0]))
  return { startFen, afterFirstFen: afterFirst.fen(), endFen: game.fen(), activeLine, moves, first: moves[0], attacker: moves[0].color }
}

function rayRelations(game, from) {
  const piece = game.get(from)
  if (!piece || !SLIDERS.has(piece.type)) return []
  const x = from.charCodeAt(0) - 97
  const y = Number(from[1]) - 1
  const relations = []
  for (const [dx, dy] of directionsFor(piece.type)) {
    const firstSquare = square(x + dx, y + dy)
    if (!firstSquare) continue
    const intervening = game.get(firstSquare)
    if (!intervening) continue
    for (let distance = 2; distance < 8; distance += 1) {
      const targetSquare = square(x + dx * distance, y + dy * distance)
      if (!targetSquare) break
      const target = game.get(targetSquare)
      if (!target) continue
      relations.push({ attackerSquare: from, attacker: piece, interveningSquare: firstSquare, intervening, targetSquare, target })
      break
    }
  }
  return relations
}

function scoreForAttacker(engineResult, fen, attacker) {
  if (!engineResult?.scoreType || engineResult.scoreValue == null) return null
  const native = engineResult.scoreType === 'mate' ? Math.sign(engineResult.scoreValue) * 100000 : engineResult.scoreValue
  const whiteScore = new Chess(fen).turn() === 'w' ? native : -native
  return attacker === 'w' ? whiteScore : -whiteScore
}

function concreteLineProof(replay) {
  const end = new Chess(replay.endFen)
  return { gain: materialGain(replay.startFen, replay.endFen, replay.attacker), mate: end.isCheckmate() }
}

function capturesByLine(replay, color) {
  const game = new Chess(replay.startFen)
  const captures = []
  for (const uci of replay.activeLine) {
    const move = game.move(moveFromUci(uci))
    if (move?.color === color && move.captured) captures.push(move)
  }
  return captures
}

function firstTargetCapture(replay) {
  return capturesByLine(replay, replay.attacker).find((move) => (VALUE[move.captured] ?? 0) >= 1) ?? null
}

function evidenceBase(replay, engine) {
  const line = concreteLineProof(replay)
  return {
    storedLine: replay.activeLine,
    concreteResult: line.mate ? 'forced mate in stored continuation' : `stored continuation gains ${line.gain} pawn-equivalent(s)`,
    engine: engine ? { depth: engine.depth, pv: engine.pv, bestMove: engine.bestMove, scoreType: engine.scoreType, scoreValue: engine.scoreValue } : null,
  }
}

function needsBestDefenseProof(replay) {
  const proof = concreteLineProof(replay)
  return proof.mate || proof.gain >= 1
}

function pvMaterialGain(fen, pv, attacker) {
  const game = new Chess(fen)
  for (const uci of pv ?? []) {
    if (!game.move(moveFromUci(uci))) break
  }
  return materialGain(fen, game.fen(), attacker)
}

function proveWithEngine(replay, engineResult) {
  const line = concreteLineProof(replay)
  const score = scoreForAttacker(engineResult, replay.afterFirstFen, replay.attacker)
  const bestDefenseGain = pvMaterialGain(replay.afterFirstFen, engineResult?.pv, replay.attacker)
  if (engineResult?.scoreType === 'mate' && score != null && score > 0) return { proven: true, reason: 'fixed-depth best defense still leads to mate', bestDefenseGain }
  if (line.gain >= 2 && score != null && score >= 150 && bestDefenseGain >= 1) return { proven: true, reason: `stored continuation wins ${line.gain} pawn-equivalent(s) and best-defense PV retains ${bestDefenseGain}`, bestDefenseGain }
  return { proven: false, reason: 'no concrete decisive result against best defense' }
}

function validateXray(replay, theme, engine) {
  const afterFirst = new Chess(replay.startFen)
  afterFirst.move(moveFromUci(replay.activeLine[0]))
  const relations = rayRelations(afterFirst, replay.first.to)
    .filter(({ attacker, target }) => attacker.color === replay.attacker && target.color !== replay.attacker && target.type !== 'k')
  if (!relations.length) return { status: BATCH1_STATUS.MISCLASSIFIED, reason: 'no sliding through-piece relation after the tactic move' }
  const relation = relations.find(({ target }) => (VALUE[target.type] ?? 0) >= 3) ?? relations[0]
  if (relation.target.type === 'k') return { status: BATCH1_STATUS.MISCLASSIFIED, reason: 'king line relation is a pin/check rather than an x-ray target' }
  if (!needsBestDefenseProof(replay)) return { status: BATCH1_STATUS.AMBIGUOUS, reason: 'x-ray relation exists but stored line has no concrete gain' }
  const proof = proveWithEngine(replay, engine)
  if (!proof.proven) return { status: BATCH1_STATUS.AMBIGUOUS, reason: proof.reason }
  const evidence = { ...evidenceBase(replay, engine), xray: {
    attacker: describe(relation.attacker, relation.attackerSquare), intervening: describe(relation.intervening, relation.interveningSquare), target: describe(relation.target, relation.targetSquare),
  } }
  evidence.explanation = `X-ray: ${evidence.xray.attacker} attacks ${evidence.xray.target} through ${evidence.xray.intervening}.`
  evidence.highlightSquares = [relation.attackerSquare, relation.interveningSquare, relation.targetSquare]
  return { status: BATCH1_STATUS.VALID, reason: proof.reason, evidence }
}

function validateHanging(replay, engine) {
  const capture = firstTargetCapture(replay)
  if (!capture) return { status: BATCH1_STATUS.MISCLASSIFIED, reason: 'stored continuation never captures an alleged hanging target' }
  const targetValue = VALUE[capture.captured] ?? 0
  const proof = proveWithEngine(replay, engine)
  if (targetValue < 1 || !proof.proven) return { status: BATCH1_STATUS.AMBIGUOUS, reason: proof.reason }
  const evidence = { ...evidenceBase(replay, engine), hanging: { targetSquare: capture.to, capture: `${capture.from}${capture.to}${capture.promotion ?? ''}`, capturedPiece: capture.captured, targetValue } }
  evidence.explanation = `Hanging piece: the ${({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' })[capture.captured]} on ${capture.to} is legally captured without a sufficient recapture.`
  evidence.highlightSquares = [capture.from, capture.to]
  return { status: BATCH1_STATUS.VALID, reason: proof.reason, evidence }
}

function validateTrapped(replay, engine) {
  const capture = capturesByLine(replay, replay.attacker).find((move, index) => index > 0 && (VALUE[move.captured] ?? 0) >= 3)
  if (!capture || (VALUE[capture.captured] ?? 0) < 3) return { status: BATCH1_STATUS.MISCLASSIFIED, reason: 'stored continuation does not win a major/minor target' }
  const targetSquare = capture.to
  const beforeCapture = new Chess(replay.startFen)
  for (const uci of replay.activeLine.slice(0, -1)) beforeCapture.move(moveFromUci(uci))
  const target = beforeCapture.get(targetSquare)
  const escapes = target && target.color !== replay.attacker ? beforeCapture.moves({ verbose: true }).filter((move) => move.from === targetSquare) : []
  if (escapes.length > 0) return { status: BATCH1_STATUS.AMBIGUOUS, reason: 'alleged trapped piece has legal escape moves requiring deeper proof' }
  const proof = proveWithEngine(replay, engine)
  if (!proof.proven) return { status: BATCH1_STATUS.AMBIGUOUS, reason: proof.reason }
  const evidence = { ...evidenceBase(replay, engine), trapped: { targetSquare, target: target ? describe(target, targetSquare) : `captured piece on ${targetSquare}`, escapeCount: 0 } }
  evidence.explanation = `Trapped piece: ${evidence.trapped.target} has no legal escape before the verified capture.`
  evidence.highlightSquares = [capture.from, targetSquare]
  return { status: BATCH1_STATUS.VALID, reason: proof.reason, evidence }
}

function validateRemovalOfDefender(replay, engine) {
  const first = replay.first
  if (!first.captured) return { status: BATCH1_STATUS.MISCLASSIFIED, reason: 'removing move does not capture a defender' }
  const laterCapture = capturesByLine(replay, replay.attacker).find((move, index) => index > 0 && (VALUE[move.captured] ?? 0) >= 3)
  if (!laterCapture) return { status: BATCH1_STATUS.AMBIGUOUS, reason: 'no later material target proves a defensive duty' }
  const proof = proveWithEngine(replay, engine)
  if (!proof.proven) return { status: BATCH1_STATUS.AMBIGUOUS, reason: proof.reason }
  const evidence = { ...evidenceBase(replay, engine), removal: { defenderSquare: first.to, removingMove: `${first.from}${first.to}${first.promotion ?? ''}`, targetSquare: laterCapture.to, targetPiece: laterCapture.captured } }
  evidence.explanation = `Removal of defender: capturing the defender on ${first.to} enables the verified capture on ${laterCapture.to}.`
  evidence.highlightSquares = [first.from, first.to, laterCapture.to]
  return { status: BATCH1_STATUS.VALID, reason: proof.reason, evidence }
}

function validateF2F7(replay, engine) {
  const relevant = replay.moves.filter((move) => move.from === 'f2' || move.to === 'f2' || move.from === 'f7' || move.to === 'f7')
  if (!relevant.length) return { status: BATCH1_STATUS.MISCLASSIFIED, reason: 'stored tactic does not specifically use f2 or f7' }
  const proof = proveWithEngine(replay, engine)
  if (!proof.proven) return { status: BATCH1_STATUS.AMBIGUOUS, reason: proof.reason }
  const move = relevant[0]
  const weakness = move.from === 'f2' || move.to === 'f2' ? 'f2' : 'f7'
  const evidence = { ...evidenceBase(replay, engine), f2f7: { weakness, move: `${move.from}${move.to}${move.promotion ?? ''}`, attackers: replay.moves.filter((entry) => entry.color === replay.attacker).map((entry) => `${entry.piece}@${entry.to}`) } }
  evidence.explanation = `f2/f7 attack: the verified continuation specifically exploits ${weakness}.`
  evidence.highlightSquares = [weakness, move.from, move.to]
  return { status: BATCH1_STATUS.VALID, reason: proof.reason, evidence }
}

function hasStructuralBatch1Candidate(replay, theme) {
  if (theme.endsWith('-xray')) {
    const afterFirst = new Chess(replay.startFen)
    afterFirst.move(moveFromUci(replay.activeLine[0]))
    return rayRelations(afterFirst, replay.first.to).some(({ attacker, target }) => attacker.color === replay.attacker && target.color !== replay.attacker && target.type !== 'k')
  }
  if (theme === 'hanging-piece') return Boolean(firstTargetCapture(replay))
  if (theme === 'trapped-piece') return Boolean(capturesByLine(replay, replay.attacker).find((move, index) => index > 0 && (VALUE[move.captured] ?? 0) >= 3))
  if (theme === 'remove-the-defender') return Boolean(replay.first.captured && capturesByLine(replay, replay.attacker).find((move, index) => index > 0 && (VALUE[move.captured] ?? 0) >= 3))
  if (theme === 'attacking-f2-f7') return replay.moves.some((move) => move.from === 'f2' || move.to === 'f2' || move.from === 'f7' || move.to === 'f7')
  return false
}

export async function validateBatch1Record(raw, theme, engine) {
  try {
    const replay = legalReplay(raw)
    let structural
    // A concrete stored win/mate is mandatory before the engine is queried.
    if (!needsBestDefenseProof(replay)) return { status: BATCH1_STATUS.AMBIGUOUS, reason: 'stored continuation has no concrete tactical result' }
    if (!hasStructuralBatch1Candidate(replay, theme)) return { status: BATCH1_STATUS.MISCLASSIFIED, reason: 'declared tactic has no required structural relationship' }
    const engineResult = engine ? await engine.evaluate(replay.afterFirstFen) : null
    if (theme.endsWith('-xray')) structural = validateXray(replay, theme, engineResult)
    else if (theme === 'hanging-piece') structural = validateHanging(replay, engineResult)
    else if (theme === 'trapped-piece') structural = validateTrapped(replay, engineResult)
    else if (theme === 'remove-the-defender') structural = validateRemovalOfDefender(replay, engineResult)
    else if (theme === 'attacking-f2-f7') structural = validateF2F7(replay, engineResult)
    else structural = { status: BATCH1_STATUS.BROKEN, reason: `unsupported Batch 1 theme ${theme}` }
    return { ...structural, replay, engine: engineResult }
  } catch (error) {
    return { status: BATCH1_STATUS.BROKEN, reason: error instanceof Error ? error.message : 'unknown legal replay failure' }
  }
}

function parseInfo(output) {
  const score = [...output.matchAll(/score\s+(cp|mate)\s+(-?\d+)/g)].at(-1)
  const pv = [...output.matchAll(/\bpv\s+([^\r\n]+)/g)].at(-1)
  return { bestMove: output.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1] ?? null, scoreType: score?.[1] ?? null, scoreValue: score ? Number(score[2]) : null, pv: pv?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [] }
}

/** Fixed depth only: no wall-clock cut-off is used for semantic validation. */
export class FixedDepthStockfish18 {
  constructor() {
    this.buffer = ''
    this.proc = null
  }
  send(command) { this.proc?.stdin.write(`${command}\n`) }
  async waitFor(token) {
    while (!this.buffer.includes(token)) await new Promise((resolve) => setTimeout(resolve, 5))
    const output = this.buffer
    this.buffer = ''
    return output
  }
  async init() {
    const runner = path.join(process.cwd(), 'node_modules', 'stockfish', 'bin', 'stockfish-18-single.js')
    this.proc = spawn(process.execPath, [runner], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc.stdout.on('data', (data) => { this.buffer += data.toString() })
    this.proc.stderr.on('data', () => {})
    this.send('uci'); await this.waitFor('uciok')
    this.send(`setoption name Threads value ${BATCH1_ENGINE.threads}`)
    this.send(`setoption name Hash value ${BATCH1_ENGINE.hashMb}`)
    this.send('setoption name UCI_LimitStrength value false')
    this.send('isready'); await this.waitFor('readyok')
  }
  async evaluate(fen) {
    this.buffer = ''
    this.send('ucinewgame')
    this.send(`position fen ${fen}`)
    this.send(`go depth ${BATCH1_ENGINE.depth}`)
    return { ...parseInfo(await this.waitFor('bestmove')), depth: BATCH1_ENGINE.depth }
  }
  quit() { this.send('quit') }
}
