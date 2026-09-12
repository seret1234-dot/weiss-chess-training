import { Chess } from "chess.js"

const files = "abcdefgh"

export const KILL_BOX_SUBPATTERNS = {
  "kill-box-adjacent-rook": {
    label: "Kill Box — Adjacent Rook",
    family: "adjacent-rook",
  },
  "kill-box-rook-rail": {
    label: "Kill Box — Rook Rail",
    family: "rook-rail",
  },
  "kill-box-queen-fence": {
    label: "Kill Box — Queen Fence",
    family: "queen-fence",
  },
} 

function point(square) {
  return [files.indexOf(square[0]), Number(square[1]) - 1]
}

function chebyshevDistance(left, right) {
  const [leftFile, leftRank] = point(left)
  const [rightFile, rightRank] = point(right)
  return Math.max(Math.abs(leftFile - rightFile), Math.abs(leftRank - rightRank))
}

function clearRay(game, from, to) {
  const [fromFile, fromRank] = point(from)
  const [toFile, toRank] = point(to)
  const fileStep = Math.sign(toFile - fromFile)
  const rankStep = Math.sign(toRank - fromRank)
  let file = fromFile + fileStep
  let rank = fromRank + rankStep

  while (file !== toFile || rank !== toRank) {
    if (game.get(`${files[file]}${rank + 1}`)) return false
    file += fileStep
    rank += rankStep
  }
  return true
}

function queenAttacks(game, from, to) {
  const [fromFile, fromRank] = point(from)
  const [toFile, toRank] = point(to)
  const fileDistance = Math.abs(toFile - fromFile)
  const rankDistance = Math.abs(toRank - fromRank)
  return (fileDistance === 0 || rankDistance === 0 || fileDistance === rankDistance)
    && clearRay(game, from, to)
}

function findKing(game, color) {
  for (const rank of "12345678") {
    for (const file of files) {
      if (game.get(`${file}${rank}`)?.type === "k" && game.get(`${file}${rank}`)?.color === color) {
        return `${file}${rank}`
      }
    }
  }
  throw new Error(`Missing ${color} king`)
}

function applyUci(game, uci) {
  const normalized = String(uci ?? "").trim().toLowerCase()
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized)) throw new Error(`Invalid UCI move: ${uci}`)
  const move = game.move({
    from: normalized.slice(0, 2),
    to: normalized.slice(2, 4),
    promotion: normalized.slice(4, 5) || undefined,
  })
  if (!move) throw new Error(`Illegal UCI move: ${uci}`)
  return move
}

function solutionLine(record) {
  if (Array.isArray(record.solutionLine)) return record.solutionLine
  if (Array.isArray(record.moves)) return record.moves
  if (Array.isArray(record.solution)) return record.solution
  throw new Error(`Missing solution line for ${record.id ?? record.puzzleId ?? "unknown record"}`)
}

function finalMatingPiece(game, finalMove) {
  const piece = game.get(finalMove.to)
  if (!piece || piece.color !== finalMove.color) {
    throw new Error(`Missing final mating piece on ${finalMove.to}`)
  }
  return piece.type
}

/**
 * Classifies only the established regular Kill Box corpus by its persisted,
 * complete mating line. This is not an arbitrary-position mate detector and
 * is intentionally not used by Master Mates.
 */
export function classifyKillBoxStoredPuzzle(record) {
  const game = new Chess(record.fen ?? record.FEN)
  if (record.preMove) applyUci(game, record.preMove)

  let finalMove = null
  for (const uci of solutionLine(record)) finalMove = applyUci(game, uci)
  if (!finalMove || !game.isCheckmate()) throw new Error(`Expected a legal checkmate for ${record.id ?? record.puzzleId ?? "unknown record"}`)

  const learnerColor = finalMove.color
  const matingPiece = finalMatingPiece(game, finalMove)
  const defenderColor = learnerColor === "w" ? "b" : "w"
  const defenderKing = findKing(game, defenderColor)
  const mateDistance = Number(record.mateDistance)
  const distance = chebyshevDistance(finalMove.to, defenderKing)
  const friendlyQueens = []
  const friendlyRooks = []

  for (const rank of "12345678") {
    for (const file of files) {
      const square = `${file}${rank}`
      const piece = game.get(square)
      if (piece?.color !== learnerColor) continue
      if (piece.type === "q") friendlyQueens.push(square)
      if (piece.type === "r") friendlyRooks.push(square)
    }
  }

  const queenSupportsMate = friendlyQueens.some((square) => queenAttacks(game, square, finalMove.to))
  const rookFencesKing = friendlyRooks.some((square) => chebyshevDistance(square, defenderKing) === 1)

  if (matingPiece === "r" && distance === 1 && queenSupportsMate) {
    return { slug: "kill-box-adjacent-rook", classification: "adjacent-rook", mateDistance }
  }
  if (matingPiece === "r" && distance === 2 && queenSupportsMate) {
    return { slug: "kill-box-rook-rail", classification: "rook-rail", mateDistance }
  }
  if (matingPiece === "q" && distance === 1 && rookFencesKing) {
    return { slug: "kill-box-queen-fence", classification: "queen-fence", mateDistance }
  }
  if (matingPiece === "q" && distance === 1) {
    return { slug: "kill-box-unclassified", classification: "nonconforming-adjacent-queen", mateDistance }
  }
  return { slug: "kill-box-unclassified", classification: "unresolved", mateDistance }
}
