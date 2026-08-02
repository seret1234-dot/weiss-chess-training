import { spawn } from "node:child_process"
import { Chess } from "chess.js"
import { moveFromUci, normalizeUci, storedLine, validateTacticRecord } from "./pattern-tactic-semantic-validator.mjs"

export const FORK_SOUNDNESS_ENGINE = Object.freeze({
  name: "Stockfish 18",
  depth: 12,
  threads: 1,
  hashMb: 64,
})

export const FORK_SOUNDNESS_CLASSES = Object.freeze({
  SOUND_CHECKING: "SOUND_CHECKING_FORK",
  SOUND_NON_CHECKING: "SOUND_NON_CHECKING_FORK",
  SOUND_SACRIFICIAL: "SOUND_SACRIFICIAL_OR_TACTICALLY_JUSTIFIED_FORK",
  UNSOUND_CAPTURE: "UNSOUND_FORK_PIECE_CAPTURED_SAFELY",
  UNSOUND_ESCAPE: "UNSOUND_TARGETS_ESCAPE",
  UNSOUND_COUNTER: "UNSOUND_COUNTERTACTIC",
  AMBIGUOUS: "AMBIGUOUS_ENGINE_LIMIT",
  BROKEN: "BROKEN",
})

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const STOCKFISH = "C:/Users/Ariel/chess-trainer/stockfish-windows-x86-64-avx2/stockfish/stockfish-windows-x86-64-avx2.exe"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function materialFor(game, color) {
  return game.board().flat().reduce((total, piece) => total + (piece?.color === color ? VALUE[piece.type] : 0), 0)
}

function materialDelta(beforeFen, afterFen, attacker) {
  const before = new Chess(beforeFen)
  const after = new Chess(afterFen)
  return materialFor(after, attacker) - materialFor(before, attacker)
}

function attackedSquares(game, from) {
  const piece = game.get(from)
  if (!piece) return []
  // chess.js returns only legal moves, whereas fork geometry also needs attacks
  // through a currently pinned mover. Use a temporary turn-neutral scan instead.
  const [file, rank] = [from.charCodeAt(0) - 97, Number(from[1]) - 1]
  const square = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8 ? `${String.fromCharCode(97 + x)}${y + 1}` : null
  const out = []
  const add = (dx, dy) => { const target = square(file + dx, rank + dy); if (target) out.push(target) }
  const knight = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-1, 2], [-2, 1]]
  const king = [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]]
  if (piece.type === "n") knight.forEach(([x, y]) => add(x, y))
  else if (piece.type === "k") king.forEach(([x, y]) => add(x, y))
  else if (piece.type === "p") { const d = piece.color === "w" ? 1 : -1; add(-1, d); add(1, d) }
  else {
    const directions = piece.type === "r" ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
      : piece.type === "b" ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
        : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    for (const [dx, dy] of directions) for (let distance = 1; distance < 8; distance += 1) {
      const target = square(file + dx * distance, rank + dy * distance)
      if (!target) break
      out.push(target)
      if (game.get(target)) break
    }
  }
  return out
}

function meaningfulTargets(game, forkSquare, attacker) {
  return attackedSquares(game, forkSquare)
    .map((square) => ({ square, piece: game.get(square) }))
    .filter(({ piece }) => piece && piece.color !== attacker && (piece.type === "k" || VALUE[piece.type] >= 3))
}

function replay(raw) {
  const game = new Chess(String(raw.fen ?? raw.FEN ?? ""))
  const line = storedLine(raw)
  const preMove = normalizeUci(raw.preMove)
  if (preMove) game.move(moveFromUci(preMove))
  const activeLine = preMove && line[0] === preMove ? line.slice(1) : line
  if (!activeLine.length) throw new Error("missing stored tactic move")
  const beforeFen = game.fen()
  const first = game.move(moveFromUci(activeLine[0]))
  if (!first) throw new Error(`illegal stored tactic move ${activeLine[0]}`)
  const afterFen = game.fen()
  const stored = new Chess(afterFen)
  for (const uci of activeLine.slice(1)) {
    const played = stored.move(moveFromUci(uci))
    if (!played) throw new Error(`illegal stored continuation ${uci}`)
  }
  return { beforeFen, afterFen, storedEndFen: stored.fen(), activeLine, first, attacker: first.color }
}

function parseInfo(output) {
  const score = [...output.matchAll(/score\s+(cp|mate)\s+(-?\d+)/g)].at(-1)
  const pv = [...output.matchAll(/\bpv\s+([^\r\n]+)/g)].at(-1)
  return {
    bestMove: output.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1] ?? null,
    scoreType: score?.[1] ?? null,
    scoreValue: score ? Number(score[2]) : null,
    pv: pv?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [],
  }
}

export class FixedDepthStockfish {
  constructor(executable = STOCKFISH, options = FORK_SOUNDNESS_ENGINE) {
    this.executable = executable
    this.options = options
    this.buffer = ""
    this.proc = null
  }

  send(command) { this.proc?.stdin.write(`${command}\n`) }

  async waitFor(token, timeoutMs = 120000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (this.buffer.includes(token)) { const output = this.buffer; this.buffer = ""; return output }
      await sleep(5)
    }
    throw new Error(`Stockfish did not return ${token} at fixed depth ${this.options.depth}`)
  }

  async init() {
    this.proc = spawn(this.executable)
    this.proc.stdout.on("data", (data) => { this.buffer += data.toString() })
    this.proc.stderr.on("data", () => {})
    this.send("uci"); await this.waitFor("uciok")
    this.send(`setoption name Threads value ${this.options.threads}`)
    this.send(`setoption name Hash value ${this.options.hashMb}`)
    this.send("setoption name UCI_LimitStrength value false")
    this.send("isready"); await this.waitFor("readyok")
  }

  async evaluate(fen) {
    this.buffer = ""
    this.send("ucinewgame")
    this.send(`position fen ${fen}`)
    this.send(`go depth ${this.options.depth}`)
    return { ...parseInfo(await this.waitFor("bestmove")), depth: this.options.depth }
  }

  quit() { this.send("quit") }
}

function scoreForAttacker(engineResult, fen, attacker) {
  if (!engineResult.scoreType || engineResult.scoreValue === null) return null
  const sideToMove = new Chess(fen).turn()
  const native = engineResult.scoreType === "mate" ? Math.sign(engineResult.scoreValue) * 100000 : engineResult.scoreValue
  const white = sideToMove === "w" ? native : -native
  return attacker === "w" ? white : -white
}

function applyPv(fen, pv) {
  const game = new Chess(fen)
  const played = []
  for (const uci of pv) {
    const move = game.move(moveFromUci(uci))
    if (!move) break
    played.push(uci)
  }
  return { fen: game.fen(), played }
}

function isMateForAttacker(result, fen, attacker) {
  return result.scoreType === "mate" && (scoreForAttacker(result, fen, attacker) ?? -1) > 0
}

function concreteGain(startFen, endFen, attacker) {
  return materialDelta(startFen, endFen, attacker)
}

function describePiece(piece, square) { return `${piece.color === "w" ? "White" : "Black"} ${({ p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" })[piece.type]} on ${square}` }

function proofFrom(result, startFen, attacker) {
  const pvEnd = applyPv(startFen, result.pv)
  const pvGain = concreteGain(startFen, pvEnd.fen, attacker)
  return { forcedMate: isMateForAttacker(result, startFen, attacker), pvGain, pv: pvEnd.played, result }
}

export async function assessForkSoundness(raw, theme, engine) {
  const geometry = validateTacticRecord(raw, theme)
  if (geometry.status !== "VALID") return { classification: FORK_SOUNDNESS_CLASSES.BROKEN, reason: "does not pass geometric fork validation", geometry }
  try {
    const position = replay(raw)
    const after = new Chess(position.afterFen)
    const forkSquare = position.first.to
    const forkPiece = after.get(forkSquare)
    const targets = meaningfulTargets(after, forkSquare, position.attacker)
    const replies = after.moves({ verbose: true })
    const captures = replies.filter((move) => move.to === forkSquare && Boolean(move.captured))
    const storedGain = concreteGain(position.afterFen, position.storedEndFen, position.attacker)
    const best = await engine.evaluate(position.afterFen)
    const bestProof = proofFrom(best, position.afterFen, position.attacker)
    const bestReplyPosition = new Chess(position.afterFen)
    if (best.bestMove) bestReplyPosition.move(moveFromUci(best.bestMove))
    const followUps = bestReplyPosition.moves({ verbose: true })
      .filter((move) => move.from === forkSquare && Boolean(move.captured) && (VALUE[move.captured] ?? 0) >= 2)
    const followUpAnalyses = []
    for (const followUp of followUps) {
      const game = new Chess(bestReplyPosition.fen())
      game.move(followUp)
      const result = await engine.evaluate(game.fen())
      followUpAnalyses.push({
        uci: `${followUp.from}${followUp.to}${followUp.promotion ?? ""}`,
        san: followUp.san,
        capturedValue: VALUE[followUp.captured] ?? 0,
        result,
        attackerScore: scoreForAttacker(result, game.fen(), position.attacker),
      })
    }
    const captureAnalyses = []
    for (const capture of captures) {
      const game = new Chess(position.afterFen)
      game.move(capture)
      const result = await engine.evaluate(game.fen())
      captureAnalyses.push({ uci: `${capture.from}${capture.to}${capture.promotion ?? ""}`, san: capture.san, proof: proofFrom(result, game.fen(), position.attacker) })
    }
    const requiredGain = 2
    const verifiedFollowUp = followUpAnalyses.some(({ capturedValue, attackerScore }) => capturedValue >= requiredGain && (attackerScore ?? -99999) >= 150)
    const continuationProof = storedGain >= requiredGain || bestProof.pvGain >= requiredGain || bestProof.forcedMate || verifiedFollowUp
    const allCapturesRefuted = captureAnalyses.every(({ proof }) => proof.forcedMate || proof.pvGain >= requiredGain)
    const capturable = captures.length > 0
    const checking = after.isCheck()
    let classification
    let reason
    if (continuationProof && (!capturable || allCapturesRefuted)) {
      classification = checking ? FORK_SOUNDNESS_CLASSES.SOUND_CHECKING : capturable ? FORK_SOUNDNESS_CLASSES.SOUND_SACRIFICIAL : FORK_SOUNDNESS_CLASSES.SOUND_NON_CHECKING
      reason = bestProof.forcedMate ? "best defense still leads to forced mate" : storedGain >= requiredGain ? `stored continuation proves a net ${storedGain}-pawn-equivalent gain` : bestProof.pvGain >= requiredGain ? `fixed-depth best-defense PV proves a net ${bestProof.pvGain}-pawn-equivalent gain` : "after Stockfish's best defense, the forking piece has a verified safe capture of a meaningful target"
    } else if (capturable && captureAnalyses.some(({ proof }) => !proof.forcedMate && proof.pvGain < requiredGain)) {
      classification = FORK_SOUNDNESS_CLASSES.UNSOUND_CAPTURE
      reason = "a legal immediate capture of the forking piece is not refuted by forced mate or a two-pawn-equivalent gain"
    } else if ((scoreForAttacker(best, position.afterFen, position.attacker) ?? 0) < -150) {
      classification = FORK_SOUNDNESS_CLASSES.UNSOUND_COUNTER
      reason = "best defense creates a stronger countertactic for the defender"
    } else {
      classification = FORK_SOUNDNESS_CLASSES.UNSOUND_ESCAPE
      reason = "best defense can neutralize the fork without a verified material gain or mate"
    }
    const evidence = {
      forkingPiece: forkPiece ? describePiece(forkPiece, forkSquare) : null,
      forkSquare,
      targets: targets.map(({ square, piece }) => describePiece(piece, square)),
      targetSquares: targets.map(({ square }) => square),
      checking,
      capturable,
      legalReplyCount: replies.length,
      captureReplies: captures.map((move) => ({ san: move.san, uci: `${move.from}${move.to}${move.promotion ?? ""}` })),
      bestDefense: { uci: best.bestMove, pv: bestProof.pv, depth: best.depth, scoreType: best.scoreType, scoreValue: best.scoreValue, attackerScore: scoreForAttacker(best, position.afterFen, position.attacker), pvMaterialGain: bestProof.pvGain },
      followUpAnalysis: followUpAnalyses.map(({ uci, san, capturedValue, result, attackerScore }) => ({ uci, san, capturedValue, pv: result.pv, depth: result.depth, scoreType: result.scoreType, scoreValue: result.scoreValue, attackerScore })),
      captureAnalysis: captureAnalyses.map(({ uci, san, proof }) => ({ uci, san, pv: proof.pv, depth: proof.result.depth, scoreType: proof.result.scoreType, scoreValue: proof.result.scoreValue, pvMaterialGain: proof.pvGain, forcedMate: proof.forcedMate })),
      storedLine: position.activeLine,
      storedMaterialGain: storedGain,
    }
    return { classification, reason, geometry, evidence, engine: FORK_SOUNDNESS_ENGINE }
  } catch (error) {
    return { classification: FORK_SOUNDNESS_CLASSES.BROKEN, reason: error instanceof Error ? error.message : "fork replay failed", geometry }
  }
}

export function isSoundFork(assessment) {
  return [FORK_SOUNDNESS_CLASSES.SOUND_CHECKING, FORK_SOUNDNESS_CLASSES.SOUND_NON_CHECKING, FORK_SOUNDNESS_CLASSES.SOUND_SACRIFICIAL].includes(assessment.classification)
}

export function formatForkExplanation(evidence) {
  if (!evidence?.forkingPiece || !Array.isArray(evidence.targets)) return null
  const prefix = evidence.checking ? "Checking fork" : "Fork"
  const targets = evidence.targets.join(" and ")
  const captureNote = evidence.capturable ? " The forking piece is capturable, but every legal capture is refuted by the verified continuation." : " The fork cannot be safely neutralized."
  const best = evidence.bestDefense?.pv?.length ? ` Best defense: ${evidence.bestDefense.pv.join(" ")}.` : ""
  return `${prefix}: ${evidence.forkingPiece} attacks ${targets}.${captureNote}${best}`
}
