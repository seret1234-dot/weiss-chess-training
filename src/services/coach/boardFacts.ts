import { Chess } from "chess.js"
import type {
  BoardFactResult,
  ChessColor,
  EvidenceConfidence,
  MaterialSnapshot,
  MistakeEvidence,
  MistakeExplainInput,
  MistakeTag,
  PositionalEvidence,
  TacticalEvidence,
  VerifiedLine,
} from "./types"

type LegalMove = {
  san: string
  from: string
  to: string
  piece: string
  color?: "w" | "b"
  captured?: string
  promotion?: string
  flags?: string
}

type BoardPiece = {
  type: string
  color: "w" | "b"
  square: string
}

const PIECE_NAME: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
}

const PIECE_VALUE: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
}

const TAG_PRIORITY: MistakeTag[] = [
  "missed_mate",
  "allowed_mate",
  "lost_queen",
  "promotion_threat",
  "bad_trade",
  "exchange_loss",
  "hung_piece",
  "fork",
  "double_attack",
  "missed_capture",
  "missed_check",
  "missed_forcing_move",
  "king_safety",
  "passed_pawn",
  "pawn_structure",
  "development",
  "center_control",
  "piece_activity",
  "king_activity",
  "endgame_technique",
  "opening_memory",
  "generic",
]

function normalizeMoveText(moveText?: string): string {
  return (moveText || "")
    .trim()
    .replace(/0/g, "O")
    .replace(/[!?]+/g, "")
    .replace(/\s+/g, "")
}

function normalizeSan(san?: string): string {
  return normalizeMoveText(san)
    .replace(/[+#]+$/g, "")
    .replace(/e\.p\./gi, "")
}

function moveToUci(move: LegalMove): string {
  return `${move.from}${move.to}${move.promotion || ""}`.toLowerCase()
}

function getLegalMoves(chess: Chess): LegalMove[] {
  return chess.moves({ verbose: true }) as LegalMove[]
}

function isCheckmate(chess: Chess): boolean {
  const c = chess as unknown as {
    isCheckmate?: () => boolean
    in_checkmate?: () => boolean
  }

  if (typeof c.isCheckmate === "function") return c.isCheckmate()
  if (typeof c.in_checkmate === "function") return c.in_checkmate()
  return false
}

function isDraw(chess: Chess): boolean {
  const c = chess as unknown as {
    isDraw?: () => boolean
    in_draw?: () => boolean
  }

  if (typeof c.isDraw === "function") return c.isDraw()
  if (typeof c.in_draw === "function") return c.in_draw()
  return false
}

function findLegalMove(
  chess: Chess,
  san?: string,
  uci?: string
): LegalMove | undefined {
  const moves = getLegalMoves(chess)
  const targetSan = normalizeSan(san)
  const targetRaw = normalizeMoveText(san)
  const targetUci = (uci || "").trim().toLowerCase()

  return moves.find((move) => {
    const moveSan = normalizeSan(move.san)
    const moveRaw = normalizeMoveText(move.san)
    const moveUci = moveToUci(move)

    return (
      (!!targetSan && moveSan === targetSan) ||
      (!!targetRaw && moveRaw === targetRaw) ||
      (!!targetUci && moveUci === targetUci)
    )
  })
}

function findMoveFromAnyText(chess: Chess, moveText?: string): LegalMove | undefined {
  if (!moveText) return undefined
  const isUci = /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(moveText.trim())
  return isUci
    ? findLegalMove(chess, undefined, moveText)
    : findLegalMove(chess, moveText, undefined)
}

function cloneChess(chess: Chess): Chess {
  return new Chess(chess.fen())
}

function cloneAndMove(chess: Chess, move: LegalMove): Chess | null {
  try {
    const next = cloneChess(chess)
    next.move(move.san)
    return next
  } catch {
    return null
  }
}

function moveIsCapture(move?: LegalMove): boolean {
  return (
    !!move?.captured ||
    !!move?.flags?.includes("c") ||
    !!move?.flags?.includes("e")
  )
}

function moveIsCheckOrMate(move?: LegalMove): boolean {
  return !!move?.san.includes("+") || !!move?.san.includes("#")
}

function pieceName(piece?: string): string {
  if (!piece) return "piece"
  return PIECE_NAME[piece.toLowerCase()] || "piece"
}

function colorFromTurn(chess: Chess): ChessColor {
  return chess.turn() === "w" ? "white" : "black"
}

function userMaterial(snapshot: MaterialSnapshot, color: ChessColor): number {
  return color === "white"
    ? snapshot.white - snapshot.black
    : snapshot.black - snapshot.white
}

function getBoardPieces(chess: Chess): BoardPiece[] {
  const pieces: BoardPiece[] = []
  const board = chess.board()

  for (let row = 0; row < 8; row++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[row][file] as
        | { type: string; color: "w" | "b" }
        | null

      if (!piece) continue

      pieces.push({
        type: piece.type,
        color: piece.color,
        square: "abcdefgh"[file] + String(8 - row),
      })
    }
  }

  return pieces
}

function materialSnapshot(chess: Chess): MaterialSnapshot {
  const whitePieces: Record<string, number> = {
    p: 0,
    n: 0,
    b: 0,
    r: 0,
    q: 0,
  }

  const blackPieces: Record<string, number> = {
    p: 0,
    n: 0,
    b: 0,
    r: 0,
    q: 0,
  }

  for (const piece of getBoardPieces(chess)) {
    if (piece.type === "k") continue
    const counts = piece.color === "w" ? whitePieces : blackPieces
    counts[piece.type] = (counts[piece.type] || 0) + 1
  }

  const total = (counts: Record<string, number>) =>
    counts.p +
    counts.n * 3 +
    counts.b * 3 +
    counts.r * 5 +
    counts.q * 9

  const white = total(whitePieces)
  const black = total(blackPieces)

  return {
    white,
    black,
    balanceForWhite: white - black,
    whitePieces,
    blackPieces,
  }
}

function terminalData(chess: Chess): {
  terminal: VerifiedLine["terminal"]
  result?: VerifiedLine["result"]
} {
  if (isCheckmate(chess)) {
    return {
      terminal: "checkmate",
      result: chess.turn() === "w" ? "0-1" : "1-0",
    }
  }

  if (isDraw(chess)) {
    return {
      terminal: "draw",
      result: "1/2-1/2",
    }
  }

  return { terminal: "ongoing" }
}

function replayVerifiedLine(args: {
  chess: Chess
  forcedFirst?: LegalMove
  suppliedMoves?: string[]
  userColor: ChessColor
  materialBefore: MaterialSnapshot
}): VerifiedLine {
  const game = cloneChess(args.chess)
  const suppliedMoves = (args.suppliedMoves || []).filter(Boolean)
  const legalMoves: string[] = []
  let complete = true

  const suppliedFirst = findMoveFromAnyText(game, suppliedMoves[0])
  const suppliedStartsWithForced =
    !!args.forcedFirst &&
    !!suppliedFirst &&
    moveToUci(suppliedFirst) === moveToUci(args.forcedFirst)

  if (args.forcedFirst && !suppliedStartsWithForced) {
    try {
      game.move(args.forcedFirst.san)
      legalMoves.push(args.forcedFirst.san)
    } catch {
      complete = false
    }
  }

  if (complete) {
    for (const moveText of suppliedMoves) {
      const move = findMoveFromAnyText(game, moveText)

      if (!move) {
        complete = false
        break
      }

      try {
        game.move(move.san)
        legalMoves.push(move.san)
      } catch {
        complete = false
        break
      }
    }
  }

  if (
    args.forcedFirst &&
    suppliedMoves.length === 0 &&
    legalMoves.length === 0
  ) {
    try {
      game.move(args.forcedFirst.san)
      legalMoves.push(args.forcedFirst.san)
    } catch {
      complete = false
    }
  }

  const finalMaterial = materialSnapshot(game)
  const terminal = terminalData(game)

  return {
    suppliedMoves,
    legalMoves,
    complete,
    finalFen: game.fen(),
    materialSwingForUser:
      userMaterial(finalMaterial, args.userColor) -
      userMaterial(args.materialBefore, args.userColor),
    terminal: terminal.terminal,
    result: terminal.result,
  }
}

function findMatingMoves(chess: Chess): LegalMove[] {
  const result: LegalMove[] = []

  for (const move of getLegalMoves(chess)) {
    const next = cloneAndMove(chess, move)
    if (next && isCheckmate(next)) result.push(move)
  }

  return result
}

function findStrongOpponentCaptures(afterUserMove: Chess): LegalMove[] {
  return getLegalMoves(afterUserMove)
    .filter((move) => !!move.captured)
    .sort((a, b) => {
      const aCaptured = PIECE_VALUE[a.captured || "p"] || 1
      const bCaptured = PIECE_VALUE[b.captured || "p"] || 1
      const aAttacker = PIECE_VALUE[a.piece || "p"] || 1
      const bAttacker = PIECE_VALUE[b.piece || "p"] || 1

      return bCaptured * 10 - bAttacker - (aCaptured * 10 - aAttacker)
    })
}

function pushUnique<T>(arr: T[], item: T) {
  if (!arr.includes(item)) arr.push(item)
}

function pushFact(facts: string[], fact: string) {
  if (fact && !facts.includes(fact)) facts.push(fact)
}

function addTacticalEvidence(
  tactical: TacticalEvidence[],
  evidence: TacticalEvidence
) {
  if (
    tactical.some(
      (item) =>
        item.tag === evidence.tag && item.summary === evidence.summary
    )
  ) {
    return
  }

  tactical.push(evidence)
}

function addPositionalEvidence(
  positional: PositionalEvidence[],
  evidence: PositionalEvidence
) {
  if (
    positional.some(
      (item) =>
        item.tag === evidence.tag && item.summary === evidence.summary
    )
  ) {
    return
  }

  positional.push(evidence)
}

function squareCoordinates(square: string): [number, number] {
  return [
    "abcdefgh".indexOf(square[0]),
    Number(square[1]) - 1,
  ]
}

function pieceAttacksSquare(
  pieces: BoardPiece[],
  attacker: BoardPiece,
  targetSquare: string
): boolean {
  const [fromFile, fromRank] = squareCoordinates(attacker.square)
  const [toFile, toRank] = squareCoordinates(targetSquare)
  const df = toFile - fromFile
  const dr = toRank - fromRank
  const absFile = Math.abs(df)
  const absRank = Math.abs(dr)

  if (attacker.type === "p") {
    const direction = attacker.color === "w" ? 1 : -1
    return absFile === 1 && dr === direction
  }

  if (attacker.type === "n") {
    return (
      (absFile === 1 && absRank === 2) ||
      (absFile === 2 && absRank === 1)
    )
  }

  if (attacker.type === "k") {
    return Math.max(absFile, absRank) === 1
  }

  const isDiagonal = absFile === absRank && absFile > 0
  const isStraight =
    (df === 0 && dr !== 0) || (dr === 0 && df !== 0)

  if (
    (attacker.type === "b" && !isDiagonal) ||
    (attacker.type === "r" && !isStraight) ||
    (attacker.type === "q" && !isDiagonal && !isStraight)
  ) {
    return false
  }

  const stepFile = Math.sign(df)
  const stepRank = Math.sign(dr)
  let file = fromFile + stepFile
  let rank = fromRank + stepRank

  while (file !== toFile || rank !== toRank) {
    const square = "abcdefgh"[file] + String(rank + 1)
    if (pieces.some((piece) => piece.square === square)) return false
    file += stepFile
    rank += stepRank
  }

  return true
}

function detectBestMoveDoubleAttack(args: {
  before: Chess
  bestMove?: LegalMove
  bestLine?: VerifiedLine
}): TacticalEvidence[] {
  if (!args.bestMove) return []

  const after = cloneAndMove(args.before, args.bestMove)
  if (!after) return []

  const pieces = getBoardPieces(after)
  const movedPiece = pieces.find(
    (piece) => piece.square === args.bestMove?.to
  )

  if (!movedPiece) return []

  const enemyPieces = pieces.filter(
    (piece) => piece.color !== movedPiece.color
  )

  const attacked = enemyPieces.filter((piece) =>
    pieceAttacksSquare(pieces, movedPiece, piece.square)
  )

  const valuableTargets = attacked.filter(
    (piece) => piece.type === "k" || (PIECE_VALUE[piece.type] || 0) >= 3
  )

  const nonKingTargets = valuableTargets.filter(
    (piece) => piece.type !== "k"
  )

  const checksKing = valuableTargets.some(
    (piece) => piece.type === "k"
  )

  if (
    (checksKing && nonKingTargets.length >= 1) ||
    nonKingTargets.length >= 2
  ) {
    const targets = valuableTargets.map(
      (piece) => `${pieceName(piece.type)} on ${piece.square}`
    )

    const summary =
      `${args.bestMove.san} creates a double attack: the ` +
      `${pieceName(movedPiece.type)} on ${movedPiece.square} attacks ` +
      `${targets.join(" and ")}.`

    const proofMoves =
      args.bestLine?.legalMoves.slice(0, 4) || [args.bestMove.san]

    return [
      {
        tag: "fork",
        confidence: "high",
        summary,
        proofMoves,
        piece: pieceName(movedPiece.type),
        square: movedPiece.square,
        targets,
      },
      {
        tag: "double_attack",
        confidence: "high",
        summary,
        proofMoves,
        piece: pieceName(movedPiece.type),
        square: movedPiece.square,
        targets,
      },
    ]
  }

  return []
}


const ALL_SQUARES = Array.from({ length: 64 }, (_, index) => {
  const file = "abcdefgh"[index % 8]
  const rank = Math.floor(index / 8) + 1
  return `${file}${rank}`
})

function colorCode(color: ChessColor): "w" | "b" {
  return color === "white" ? "w" : "b"
}

function controlledSquares(chess: Chess, color: ChessColor): Set<string> {
  const pieces = getBoardPieces(chess)
  const attackers = pieces.filter(
    (piece) => piece.color === colorCode(color)
  )
  const controlled = new Set<string>()

  for (const square of ALL_SQUARES) {
    if (
      attackers.some((piece) =>
        pieceAttacksSquare(pieces, piece, square)
      )
    ) {
      controlled.add(square)
    }
  }

  return controlled
}

function developmentScore(chess: Chess, color: ChessColor): number {
  const c = colorCode(color)
  const homeSquares =
    c === "w"
      ? new Set(["b1", "g1", "c1", "f1"])
      : new Set(["b8", "g8", "c8", "f8"])

  return getBoardPieces(chess).filter(
    (piece) =>
      piece.color === c &&
      (piece.type === "n" || piece.type === "b") &&
      !homeSquares.has(piece.square)
  ).length
}

function centerControlScore(
  chess: Chess,
  color: ChessColor
): number {
  const controlled = controlledSquares(chess, color)
  return ["d4", "e4", "d5", "e5"].reduce(
    (score, square) => score + (controlled.has(square) ? 1 : 0),
    0
  )
}

function activityScore(chess: Chess, color: ChessColor): number {
  const c = colorCode(color)
  const pieces = getBoardPieces(chess)
  const controlled = controlledSquares(chess, color)

  const activePieces = pieces.filter(
    (piece) =>
      piece.color === c &&
      piece.type !== "p" &&
      piece.type !== "k"
  ).length

  return controlled.size + activePieces * 2
}

function pawnFiles(chess: Chess, color: ChessColor): number[][] {
  const files = Array.from({ length: 8 }, () => [] as number[])
  const c = colorCode(color)

  for (const piece of getBoardPieces(chess)) {
    if (piece.color !== c || piece.type !== "p") continue
    const [file, rank] = squareCoordinates(piece.square)
    files[file].push(rank)
  }

  return files
}

function pawnWeaknessScore(chess: Chess, color: ChessColor): number {
  const files = pawnFiles(chess, color)
  let weaknesses = 0

  for (let file = 0; file < 8; file++) {
    const pawns = files[file]
    if (pawns.length > 1) weaknesses += pawns.length - 1

    if (
      pawns.length > 0 &&
      (file === 0 || files[file - 1].length === 0) &&
      (file === 7 || files[file + 1].length === 0)
    ) {
      weaknesses += pawns.length
    }
  }

  return weaknesses
}

function passedPawnSquares(
  chess: Chess,
  color: ChessColor
): string[] {
  const pieces = getBoardPieces(chess)
  const c = colorCode(color)
  const enemy = c === "w" ? "b" : "w"

  return pieces
    .filter((piece) => piece.color === c && piece.type === "p")
    .filter((pawn) => {
      const [file, rank] = squareCoordinates(pawn.square)

      return !pieces.some((piece) => {
        if (piece.color !== enemy || piece.type !== "p") return false

        const [enemyFile, enemyRank] = squareCoordinates(piece.square)
        if (Math.abs(enemyFile - file) > 1) return false

        return c === "w" ? enemyRank > rank : enemyRank < rank
      })
    })
    .map((pawn) => pawn.square)
}

function kingDistanceFromCenter(
  chess: Chess,
  color: ChessColor
): number {
  const king = getBoardPieces(chess).find(
    (piece) =>
      piece.color === colorCode(color) && piece.type === "k"
  )

  if (!king) return 8

  const [file, rank] = squareCoordinates(king.square)
  return Math.min(
    ...[
      [3, 3],
      [4, 3],
      [3, 4],
      [4, 4],
    ].map(
      ([centerFile, centerRank]) =>
        Math.abs(file - centerFile) + Math.abs(rank - centerRank)
    )
  )
}

function kingShieldScore(chess: Chess, color: ChessColor): number {
  const pieces = getBoardPieces(chess)
  const c = colorCode(color)
  const king = pieces.find(
    (piece) => piece.color === c && piece.type === "k"
  )

  if (!king) return 0

  const [kingFile, kingRank] = squareCoordinates(king.square)
  const direction = c === "w" ? 1 : -1

  return pieces.filter((piece) => {
    if (piece.color !== c || piece.type !== "p") return false
    const [file, rank] = squareCoordinates(piece.square)
    return (
      Math.abs(file - kingFile) <= 1 &&
      rank === kingRank + direction
    )
  }).length
}

function detectPositionalEvidence(args: {
  before: Chess
  after: Chess
  bestMove?: LegalMove
  userMove: LegalMove
  userColor: ChessColor
  phase?: MistakeExplainInput["phase"]
  evalLossCp: number
}): PositionalEvidence[] {
  const evidence: PositionalEvidence[] = []
  const proofMoves = [args.userMove.san]
  const minimumLoss = args.phase === "opening" ? 40 : 70

  if (args.evalLossCp < minimumLoss) return evidence

  const beforeDevelopment = developmentScore(
    args.before,
    args.userColor
  )
  const afterDevelopment = developmentScore(
    args.after,
    args.userColor
  )

  const earlyQueenMove =
    args.phase === "opening" &&
    args.userMove.piece === "q" &&
    beforeDevelopment < 2

  if (afterDevelopment < beforeDevelopment || earlyQueenMove) {
    evidence.push({
      tag: "development",
      confidence: "medium",
      summary: earlyQueenMove
        ? `${args.userMove.san} moves the queen before the minor pieces are developed, giving the opponent useful tempi.`
        : `${args.userMove.san} reduces development instead of bringing another piece into play.`,
      proofMoves,
      beforeValue: beforeDevelopment,
      afterValue: afterDevelopment,
    })
  }

  const beforeCenter = centerControlScore(
    args.before,
    args.userColor
  )
  const afterCenter = centerControlScore(
    args.after,
    args.userColor
  )

  if (beforeCenter - afterCenter >= 2) {
    evidence.push({
      tag: "center_control",
      confidence: "medium",
      summary: `${args.userMove.san} gives up control of important central squares.`,
      proofMoves,
      beforeValue: beforeCenter,
      afterValue: afterCenter,
      squares: ["d4", "e4", "d5", "e5"],
    })
  }

  const beforeActivity = activityScore(
    args.before,
    args.userColor
  )
  const afterActivity = activityScore(
    args.after,
    args.userColor
  )

  if (beforeActivity - afterActivity >= 5) {
    evidence.push({
      tag: "piece_activity",
      confidence: "medium",
      summary: `${args.userMove.san} makes the pieces less active and reduces the squares they control.`,
      proofMoves,
      beforeValue: beforeActivity,
      afterValue: afterActivity,
    })
  }

  const beforeWeaknesses = pawnWeaknessScore(
    args.before,
    args.userColor
  )
  const afterWeaknesses = pawnWeaknessScore(
    args.after,
    args.userColor
  )

  if (afterWeaknesses > beforeWeaknesses) {
    evidence.push({
      tag: "pawn_structure",
      confidence: "medium",
      summary: `${args.userMove.san} creates an additional doubled or isolated pawn weakness.`,
      proofMoves,
      beforeValue: beforeWeaknesses,
      afterValue: afterWeaknesses,
    })
  }

  const opponentColor: ChessColor =
    args.userColor === "white" ? "black" : "white"
  const beforeEnemyPassers = passedPawnSquares(
    args.before,
    opponentColor
  )
  const afterEnemyPassers = passedPawnSquares(
    args.after,
    opponentColor
  )

  if (afterEnemyPassers.length > beforeEnemyPassers.length) {
    const newPassers = afterEnemyPassers.filter(
      (square) => !beforeEnemyPassers.includes(square)
    )

    evidence.push({
      tag: "passed_pawn",
      confidence: "medium",
      summary:
        `${args.userMove.san} allows a dangerous passed pawn` +
        (newPassers.length ? ` on ${newPassers.join(" and ")}` : "") +
        ".",
      proofMoves,
      squares: newPassers,
      beforeValue: beforeEnemyPassers.length,
      afterValue: afterEnemyPassers.length,
    })
  }

  const beforeShield = kingShieldScore(
    args.before,
    args.userColor
  )
  const afterShield = kingShieldScore(
    args.after,
    args.userColor
  )

  if (
    args.phase !== "endgame" &&
    beforeShield > afterShield &&
    args.userMove.piece === "p"
  ) {
    evidence.push({
      tag: "king_safety",
      confidence: "medium",
      summary: `${args.userMove.san} removes part of the pawn cover around the king.`,
      proofMoves,
      beforeValue: beforeShield,
      afterValue: afterShield,
    })
  }

  if (args.phase === "endgame") {
    const beforeDistance = kingDistanceFromCenter(
      args.before,
      args.userColor
    )
    const afterDistance = kingDistanceFromCenter(
      args.after,
      args.userColor
    )

    if (afterDistance > beforeDistance) {
      evidence.push({
        tag: "king_activity",
        confidence: "medium",
        summary: `${args.userMove.san} moves the king away from the active central area in an endgame.`,
        proofMoves,
        beforeValue: beforeDistance,
        afterValue: afterDistance,
      })
    }
  }

  if (
    evidence.length === 0 &&
    args.bestMove &&
    args.bestMove.piece !== args.userMove.piece
  ) {
    evidence.push({
      tag: "piece_activity",
      confidence: "low",
      summary: `${args.bestMove.san} improves a different piece and keeps the position more coordinated.`,
      proofMoves: [args.bestMove.san],
    })
  }

  return evidence
}

function confidenceRank(confidence: EvidenceConfidence): number {
  if (confidence === "high") return 3
  if (confidence === "medium") return 2
  return 1
}

function overallConfidence(args: {
  userMoveLegal: boolean
  bestMoveLegal: boolean
  tactical: TacticalEvidence[]
  positional: PositionalEvidence[]
}): EvidenceConfidence {
  if (!args.userMoveLegal) return "low"

  const allEvidence = [...args.tactical, ...args.positional]
  const strongest = allEvidence.reduce(
    (best, item) =>
      confidenceRank(item.confidence) > confidenceRank(best)
        ? item.confidence
        : best,
    "low" as EvidenceConfidence
  )

  if (strongest === "high" && args.bestMoveLegal) return "high"
  if (allEvidence.length > 0 || args.bestMoveLegal) return "medium"
  return "low"
}

export function collectBoardFacts(
  input: MistakeExplainInput
): BoardFactResult {
  const tags: MistakeTag[] = []
  const facts: string[] = []
  const tactical: TacticalEvidence[] = []
  const positional: PositionalEvidence[] = []

  let chess: Chess

  try {
    chess = new Chess(input.fenBefore)
  } catch {
    const evidence: MistakeEvidence = {
      confidence: "low",
      legalPosition: false,
      userMoveLegal: false,
      bestMoveLegal: false,
      userColor: input.userColor || "white",
      tactical: [],
      positional: [],
      primaryTag: "generic",
    }

    return {
      tags: ["generic"],
      facts: ["The position could not be loaded from the FEN."],
      evidence,
    }
  }

  const userColor = input.userColor || colorFromTurn(chess)
  const materialBefore = materialSnapshot(chess)
  const userMove = findLegalMove(
    chess,
    input.userMoveSan,
    input.userMoveUci
  )
  const bestMove = findLegalMove(
    chess,
    input.bestMoveSan,
    input.bestMoveUci
  )

  const userMoveLabel =
    userMove?.san || input.userMoveSan || input.userMoveUci
  const bestMoveLabel =
    bestMove?.san || input.bestMoveSan || input.bestMoveUci

  if (!userMove) {
    pushFact(
      facts,
      "The played move was not found among the legal moves in this position."
    )
  }

  if (!bestMove && (input.bestMoveSan || input.bestMoveUci)) {
    pushFact(
      facts,
      "The engine best move was provided, but it was not matched to a legal move."
    )
  }

  const bestLine = replayVerifiedLine({
    chess,
    forcedFirst: bestMove,
    suppliedMoves: input.bestLineSan,
    userColor,
    materialBefore,
  })

  const playedLine = replayVerifiedLine({
    chess,
    forcedFirst: userMove,
    suppliedMoves: input.playedLineSan,
    userColor,
    materialBefore,
  })

  const matingMoves = findMatingMoves(chess)
  const userPlayedMate =
    !!userMove &&
    matingMoves.some(
      (move) => moveToUci(move) === moveToUci(userMove)
    )

  if (matingMoves.length > 0 && !userPlayedMate) {
    pushUnique(tags, "missed_mate")
    const summary = `There was a direct checkmate available: ${matingMoves[0].san}.`
    pushFact(facts, summary)
    addTacticalEvidence(tactical, {
      tag: "missed_mate",
      confidence: "high",
      summary,
      proofMoves: [matingMoves[0].san],
    })
  }

  if (
    bestMove &&
    moveIsCapture(bestMove) &&
    (!userMove || !moveIsCapture(userMove))
  ) {
    pushUnique(tags, "missed_capture")
    const captured = pieceName(bestMove.captured)
    const summary = `${bestMove.san} is a forcing capture of a ${captured}.`
    pushFact(facts, summary)
    addTacticalEvidence(tactical, {
      tag: "missed_capture",
      confidence: "high",
      summary,
      proofMoves: bestLine.legalMoves.slice(0, 4),
      piece: captured,
      square: bestMove.to,
    })
  }

  if (
    bestMove &&
    moveIsCheckOrMate(bestMove) &&
    (!userMove || !moveIsCheckOrMate(userMove))
  ) {
    pushUnique(tags, "missed_check")
    const summary = `${bestMove.san} is a forcing check.`
    pushFact(facts, summary)
    addTacticalEvidence(tactical, {
      tag: "missed_check",
      confidence: "high",
      summary,
      proofMoves: bestLine.legalMoves.slice(0, 4),
    })
  }

  if (
    bestMove &&
    (moveIsCapture(bestMove) || moveIsCheckOrMate(bestMove))
  ) {
    pushUnique(tags, "missed_forcing_move")
  }

  for (const item of detectBestMoveDoubleAttack({
    before: chess,
    bestMove,
    bestLine,
  })) {
    pushUnique(tags, item.tag)
    pushFact(facts, item.summary)
    addTacticalEvidence(tactical, item)
  }

  let materialAtRisk: string | undefined
  let materialAfterUserMove: MaterialSnapshot | undefined
  let opponentBestReply: string | undefined

  if (userMove) {
    const afterUserMove = cloneAndMove(chess, userMove)

    if (afterUserMove) {
      materialAfterUserMove = materialSnapshot(afterUserMove)
      const opponentMates = findMatingMoves(afterUserMove)

      if (opponentMates.length > 0) {
        pushUnique(tags, "allowed_mate")
        const summary =
          `After ${userMove.san}, the opponent has checkmate with ` +
          `${opponentMates[0].san}.`

        pushFact(facts, summary)
        addTacticalEvidence(tactical, {
          tag: "allowed_mate",
          confidence: "high",
          summary,
          proofMoves: [userMove.san, opponentMates[0].san],
        })
      }

      const captures = findStrongOpponentCaptures(afterUserMove)
      const playedReply = playedLine.legalMoves[1]
      const matchingPlayedCapture = playedReply
        ? captures.find(
            (move) =>
              normalizeSan(move.san) === normalizeSan(playedReply)
          )
        : undefined

      const topCapture = matchingPlayedCapture || captures[0]
      opponentBestReply = playedReply || topCapture?.san

      if (topCapture?.captured) {
        const capturedValue = PIECE_VALUE[topCapture.captured] || 1
        const attackerValue = PIECE_VALUE[topCapture.piece] || 1
        const proofIsEngineLine = !!matchingPlayedCapture
        const confidence: EvidenceConfidence = proofIsEngineLine
          ? "high"
          : "medium"

        if (topCapture.captured === "q") {
          pushUnique(tags, "lost_queen")
          materialAtRisk = "queen"

          const summary =
            `${topCapture.san} wins the queen after ${userMove.san}.`

          pushFact(facts, summary)
          addTacticalEvidence(tactical, {
            tag: "lost_queen",
            confidence,
            summary,
            proofMoves: [userMove.san, topCapture.san],
            piece: "queen",
            square: topCapture.to,
          })
        } else if (capturedValue >= 3) {
          pushUnique(tags, "hung_piece")
          const capturedName = pieceName(topCapture.captured)
          materialAtRisk = capturedName

          const summary =
            `${topCapture.san} can win the ${capturedName} after ` +
            `${userMove.san}.`

          pushFact(facts, summary)
          addTacticalEvidence(tactical, {
            tag: "hung_piece",
            confidence,
            summary,
            proofMoves: [userMove.san, topCapture.san],
            piece: capturedName,
            square: topCapture.to,
          })

          if (
            topCapture.captured === "r" &&
            (topCapture.piece === "n" || topCapture.piece === "b")
          ) {
            pushUnique(tags, "exchange_loss")
            const exchangeSummary =
              `${topCapture.san} lets a minor piece take the rook, ` +
              `losing the exchange.`

            pushFact(facts, exchangeSummary)
            addTacticalEvidence(tactical, {
              tag: "exchange_loss",
              confidence,
              summary: exchangeSummary,
              proofMoves: [userMove.san, topCapture.san],
              piece: "rook",
              square: topCapture.to,
            })
          }
        }

        if (
          moveIsCapture(userMove) &&
          topCapture.to === userMove.to &&
          (PIECE_VALUE[userMove.piece] || 1) -
            (PIECE_VALUE[userMove.captured || "p"] || 1) >=
            2
        ) {
          pushUnique(tags, "bad_trade")

          const summary =
            `${userMove.san} allows the immediate recapture ` +
            `${topCapture.san}; the ${pieceName(userMove.piece)} is ` +
            `traded for only a ${pieceName(userMove.captured)}.`

          pushFact(facts, summary)
          addTacticalEvidence(tactical, {
            tag: "bad_trade",
            confidence,
            summary,
            proofMoves: [userMove.san, topCapture.san],
            piece: pieceName(userMove.piece),
            square: userMove.to,
          })
        }

        const movedPieceCanBeCaptured =
          topCapture.to === userMove.to &&
          !!topCapture.captured

        if (movedPieceCanBeCaptured && capturedValue >= 3) {
          pushUnique(tags, "hung_piece")
          pushFact(
            facts,
            `The ${pieceName(userMove.piece)} moved to ` +
              `${userMove.to} can be captured immediately.`
          )
        }

        // Avoid treating a speculative pawn capture as a major mistake.
        if (capturedValue > attackerValue && capturedValue >= 3) {
          pushFact(
            facts,
            `The opponent can use a lower-value ${pieceName(
              topCapture.piece
            )} to take a higher-value ${pieceName(
              topCapture.captured
            )}.`
          )
        }
      }

      const promotionMove = getLegalMoves(afterUserMove).find(
        (move) => !!move.promotion
      )

      if (promotionMove) {
        pushUnique(tags, "promotion_threat")

        const summary =
          `After ${userMove.san}, the opponent can promote with ` +
          `${promotionMove.san}.`

        pushFact(facts, summary)
        addTacticalEvidence(tactical, {
          tag: "promotion_threat",
          confidence: "high",
          summary,
          proofMoves: [userMove.san, promotionMove.san],
          piece: "pawn",
          square: promotionMove.to,
        })
      }

      const opponentChecks = getLegalMoves(afterUserMove).filter(
        moveIsCheckOrMate
      )

      if (
        opponentMates.length === 0 &&
        opponentChecks.length >= 2 &&
        (input.evalLossCp || 0) >= 150
      ) {
        pushUnique(tags, "king_safety")

        const summary =
          `After ${userMove.san}, the opponent has several forcing ` +
          `checks, including ${opponentChecks
            .slice(0, 2)
            .map((move) => move.san)
            .join(" and ")}.`

        pushFact(facts, summary)
        addTacticalEvidence(tactical, {
          tag: "king_safety",
          confidence: "medium",
          summary,
          proofMoves: [userMove.san, opponentChecks[0].san],
        })
      }
    }
  }

  if (userMove) {
    const afterUserMove = cloneAndMove(chess, userMove)

    if (afterUserMove) {
      for (const item of detectPositionalEvidence({
        before: chess,
        after: afterUserMove,
        bestMove,
        userMove,
        userColor,
        phase: input.phase,
        evalLossCp: input.evalLossCp || 0,
      })) {
        pushUnique(tags, item.tag)
        pushFact(facts, item.summary)
        addPositionalEvidence(positional, item)
      }
    }
  }

  if (input.phase === "opening" && input.openingName) {
    pushUnique(tags, "opening_memory")
    pushFact(
      facts,
      `This mistake happened in the ${input.openingName} opening.`
    )
  }

  if (input.phase === "endgame") {
    pushUnique(tags, "endgame_technique")
  }

  if (bestLine.legalMoves.length > 0) {
    pushFact(
      facts,
      `Verified best line: ${bestLine.legalMoves
        .slice(0, 6)
        .join(" ")}.`
    )
  }

  if (playedLine.legalMoves.length > 1) {
    pushFact(
      facts,
      `Verified consequence: ${playedLine.legalMoves
        .slice(0, 6)
        .join(" ")}.`
    )
  }

  if (tags.length === 0) tags.push("generic")

  const primaryTag =
    TAG_PRIORITY.find((tag) => tags.includes(tag)) || "generic"

  const confidence = overallConfidence({
    userMoveLegal: !!userMove,
    bestMoveLegal: !!bestMove,
    tactical,
    positional,
  })

  const evidence: MistakeEvidence = {
    confidence,
    legalPosition: true,
    userMoveLegal: !!userMove,
    bestMoveLegal: !!bestMove,
    userColor,
    materialBefore,
    materialAfterUserMove,
    bestLine,
    playedLine,
    opponentBestReply,
    tactical,
    positional,
    primaryTag,
  }

  return {
    tags,
    facts,
    userMoveLabel,
    bestMoveLabel,
    materialAtRisk,
    matingMove: matingMoves[0]?.san,
    evidence,
  }
}
