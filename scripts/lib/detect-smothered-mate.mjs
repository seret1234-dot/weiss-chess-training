import { Chess } from "chess.js"

const files = "abcdefgh"
const ranks = "12345678"
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/

function opposite(color) {
  return color === "w" ? "b" : "w"
}

function point(square) {
  return [files.indexOf(square[0]), ranks.indexOf(square[1])]
}

function chebyshevDistance(left, right) {
  const [leftFile, leftRank] = point(left)
  const [rightFile, rightRank] = point(right)
  return Math.max(Math.abs(leftFile - rightFile), Math.abs(leftRank - rightRank))
}

function allSquares() {
  return Array.from(ranks, (rank) => Array.from(files, (file) => `${file}${rank}`)).flat()
}

function findKing(game, color) {
  for (const square of allSquares()) {
    const piece = game.get(square)
    if (piece?.type === "k" && piece.color === color) return square
  }
  throw new Error(`Missing ${color} king in terminal position`)
}

function normalizeUci(uci) {
  const value = String(uci ?? "").trim().toLowerCase()
  if (!UCI.test(value)) throw new Error(`Invalid UCI move: ${uci}`)
  return value
}

function applyUci(game, uci) {
  const move = normalizeUci(uci)
  const applied = game.move({
    from: move.slice(0, 2),
    to: move.slice(2, 4),
    promotion: move.slice(4, 5) || undefined,
  })
  if (!applied) throw new Error(`Illegal UCI move: ${move}`)
  return applied
}

export function solutionLineForPuzzle(record) {
  if (Array.isArray(record.solutionLine)) return record.solutionLine
  if (Array.isArray(record.moves)) return record.moves
  if (Array.isArray(record.solution)) return record.solution
  if (typeof record.full_solution === "string") return record.full_solution.split(/\s+/).filter(Boolean)
  if (typeof record.solution === "string") return [record.solution]
  throw new Error(`Missing solution line for ${record.id ?? record.puzzleId ?? "unknown puzzle"}`)
}

/**
 * Replays the complete stored line, including Lichess's pre-move when that
 * pre-move is not already the first move in the packaged solution line.
 * chess.js handles captures, promotions, castling, and en passant as legal
 * UCI moves; no engine analysis is used.
 */
export function replayPuzzleToTerminal(record) {
  const initialFen = record.fen ?? record.FEN ?? record.initialFen
  if (typeof initialFen !== "string" || !initialFen.trim()) {
    throw new Error(`Missing initial FEN for ${record.id ?? record.puzzleId ?? "unknown puzzle"}`)
  }

  const game = new Chess(initialFen)
  const solutionLine = solutionLineForPuzzle(record).map(normalizeUci)
  const preMove = record.preMove ? normalizeUci(record.preMove) : null
  const timeline = preMove && solutionLine[0] !== preMove ? [preMove, ...solutionLine] : solutionLine
  if (!timeline.length) throw new Error(`Empty solution line for ${record.id ?? record.puzzleId ?? "unknown puzzle"}`)

  let finalMove = null
  for (const uci of timeline) finalMove = applyUci(game, uci)

  return { game, initialFen, preMove, timeline, finalMove, terminalFen: game.fen() }
}

/**
 * Faithful port of ornicar/lichess-puzzler tagger/cook.py:smothered_mate.
 *
 * The upstream predicate is called only after its mate_in() check. We retain
 * that surrounding requirement explicitly here, then reproduce its terminal
 * board geometry: an attacking knight must check the mated king and every
 * on-board adjacent king square must be occupied by a piece of the mated side.
 */
export function detectSmotheredMateAtTerminal(game) {
  if (!game.isCheckmate()) {
    return { matched: false, theme: "smothered", reason: "NOT_CHECKMATE", evidence: null }
  }

  const matedColor = game.turn()
  const attackerColor = opposite(matedColor)
  const kingSquare = findKing(game, matedColor)
  const checkingKnightSquares = allSquares().filter((square) => {
    const piece = game.get(square)
    const [fileDistance, rankDistance] = [
      Math.abs(point(square)[0] - point(kingSquare)[0]),
      Math.abs(point(square)[1] - point(kingSquare)[1]),
    ]
    return piece?.type === "n" && piece.color === attackerColor
      && ((fileDistance === 1 && rankDistance === 2) || (fileDistance === 2 && rankDistance === 1))
  })

  if (!checkingKnightSquares.length) {
    return {
      matched: false,
      theme: "smothered",
      reason: "NO_CHECKING_KNIGHT",
      evidence: { kingSquare, matedColor, attackerColor, checkingKnightSquares: [] },
    }
  }

  const neighborSquares = allSquares().filter((square) => chebyshevDistance(square, kingSquare) === 1)
  const blockers = neighborSquares.map((square) => ({ square, piece: game.get(square) ?? null }))
  const nonMatedSideBlockers = blockers.filter(({ piece }) => !piece || piece.color !== matedColor)

  if (nonMatedSideBlockers.length) {
    return {
      matched: false,
      theme: "smothered",
      reason: "KING_NEIGHBORHOOD_NOT_FULLY_MATED_SIDE",
      evidence: {
        kingSquare,
        matedColor,
        attackerColor,
        checkingKnightSquares,
        blockers,
        nonMatedSideBlockers,
      },
    }
  }

  return {
    matched: true,
    theme: "smothered",
    evidence: {
      kingSquare,
      matingKnightSquare: checkingKnightSquares[0],
      checkingKnightSquares,
      matedColor,
      attackerColor,
      blockers,
    },
  }
}

export function detectSmotheredMate(record) {
  try {
    const replay = replayPuzzleToTerminal(record)
    const result = detectSmotheredMateAtTerminal(replay.game)
    return { ...result, replay: { initialFen: replay.initialFen, preMove: replay.preMove, timeline: replay.timeline, terminalFen: replay.terminalFen } }
  } catch (error) {
    return {
      matched: false,
      theme: "smothered",
      reason: "REPLAY_ERROR",
      evidence: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
