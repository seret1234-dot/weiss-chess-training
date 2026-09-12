import {
  detectSmotheredMateAtTerminal,
  replayPuzzleToTerminal,
} from "./detect-smothered-mate.mjs"

const files = "abcdefgh"
const ranks = "12345678"

const opposite = (color) => color === "w" ? "b" : "w"
const point = (square) => [files.indexOf(square[0]), ranks.indexOf(square[1])]
const chebyshevDistance = (left, right) => {
  const [leftFile, leftRank] = point(left)
  const [rightFile, rightRank] = point(right)
  return Math.max(Math.abs(leftFile - rightFile), Math.abs(leftRank - rightRank))
}
const allSquares = () => Array.from(ranks, (rank) => Array.from(files, (file) => `${file}${rank}`)).flat()

function findKing(game, color) {
  for (const square of allSquares()) {
    const piece = game.get(square)
    if (piece?.type === "k" && piece.color === color) return square
  }
  throw new Error(`Missing ${color} king in terminal position`)
}

function clearRay(game, from, to) {
  const [fromFile, fromRank] = point(from)
  const [toFile, toRank] = point(to)
  const fileStep = Math.sign(toFile - fromFile)
  const rankStep = Math.sign(toRank - fromRank)
  let file = fromFile + fileStep
  let rank = fromRank + rankStep
  while (file !== toFile || rank !== toRank) {
    if (game.get(`${files[file]}${ranks[rank]}`)) return false
    file += fileStep
    rank += rankStep
  }
  return true
}

/** Mirrors python-chess Board.attackers(): pseudo-attacks, including pinned pieces. */
function attacksSquare(game, from, to) {
  const piece = game.get(from)
  if (!piece || from === to) return false
  const [fromFile, fromRank] = point(from)
  const [toFile, toRank] = point(to)
  const fileDistance = Math.abs(toFile - fromFile)
  const rankDistance = Math.abs(toRank - fromRank)
  if (piece.type === "p") return fileDistance === 1 && toRank - fromRank === (piece.color === "w" ? 1 : -1)
  if (piece.type === "n") return (fileDistance === 1 && rankDistance === 2) || (fileDistance === 2 && rankDistance === 1)
  if (piece.type === "k") return Math.max(fileDistance, rankDistance) === 1
  const diagonal = fileDistance === rankDistance && fileDistance > 0
  const orthogonal = (fileDistance === 0) !== (rankDistance === 0)
  if (piece.type === "b" && !diagonal) return false
  if (piece.type === "r" && !orthogonal) return false
  if (piece.type === "q" && !diagonal && !orthogonal) return false
  return clearRay(game, from, to)
}

function attackers(game, color, target) {
  return allSquares().filter((square) => game.get(square)?.color === color && attacksSquare(game, square, target))
}

function terminalContext(record) {
  const replay = replayPuzzleToTerminal(record)
  if (!replay.game.isCheckmate()) return { matched: false, reason: "NOT_CHECKMATE", replay }
  const attackerColor = replay.finalMove.color
  const defenderColor = opposite(attackerColor)
  return {
    matched: null,
    game: replay.game,
    replay,
    attackerColor,
    defenderColor,
    kingSquare: findKing(replay.game, defenderColor),
    finalMove: replay.finalMove,
    movedPieceType: replay.game.get(replay.finalMove.to)?.type,
  }
}

function result(theme, matched, evidence = null, reason = null) {
  return { matched, theme, evidence, ...(matched ? {} : { reason: reason ?? "PREDICATE_NOT_MET" }) }
}

function detectBackRank(context) {
  const { game, attackerColor, defenderColor, kingSquare } = context
  const [, kingRank] = point(kingSquare)
  const backRank = attackerColor === "w" ? 7 : 0
  if (kingRank !== backRank) return result("back-rank", false)
  const [kingFile] = point(kingSquare)
  const inwardRank = backRank + (attackerColor === "w" ? -1 : 1)
  const confinement = [`${files[kingFile]}${ranks[inwardRank]}`]
  if (kingFile < 7) confinement.push(`${files[kingFile + 1]}${ranks[inwardRank]}`)
  if (kingFile > 0) confinement.push(`${files[kingFile - 1]}${ranks[inwardRank]}`)
  for (const square of confinement) {
    const piece = game.get(square)
    if (!piece || piece.color !== defenderColor || attackers(game, attackerColor, square).length) return result("back-rank", false)
  }
  const checkingSquares = attackers(game, attackerColor, kingSquare)
  return result("back-rank", checkingSquares.some((square) => point(square)[1] === backRank), { kingSquare, confinement, checkingSquares })
}

function detectAnastasia(context) {
  const { game, attackerColor, defenderColor, kingSquare, finalMove, movedPieceType } = context
  const [kingFile, kingRank] = point(kingSquare)
  if (![0, 7].includes(kingFile) || [0, 7].includes(kingRank) || point(finalMove.to)[0] !== kingFile || !["q", "r"].includes(movedPieceType)) return result("anastasia", false)
  const direction = kingFile === 0 ? 1 : -1
  const blockerSquare = `${files[kingFile + direction]}${ranks[kingRank]}`
  const knightSquare = `${files[kingFile + 3 * direction]}${ranks[kingRank]}`
  const blocker = game.get(blockerSquare)
  const knight = game.get(knightSquare)
  return result("anastasia", !!blocker && blocker.color === defenderColor && knight?.color === attackerColor && knight.type === "n", { kingSquare, blockerSquare, knightSquare })
}

function detectHook(context) {
  const { game, attackerColor, kingSquare, finalMove, movedPieceType } = context
  if (movedPieceType !== "r" || chebyshevDistance(finalMove.to, kingSquare) !== 1) return result("hook", false)
  for (const knightSquare of attackers(game, attackerColor, finalMove.to)) {
    const knight = game.get(knightSquare)
    if (knight?.type !== "n" || chebyshevDistance(knightSquare, kingSquare) !== 1) continue
    for (const pawnSquare of attackers(game, attackerColor, knightSquare)) {
      if (game.get(pawnSquare)?.type === "p") return result("hook", true, { kingSquare, rookSquare: finalMove.to, knightSquare, pawnSquare })
    }
  }
  return result("hook", false)
}

function detectArabian(context) {
  const { game, attackerColor, kingSquare, finalMove, movedPieceType } = context
  const [kingFile, kingRank] = point(kingSquare)
  if (![0, 7].includes(kingFile) || ![0, 7].includes(kingRank) || movedPieceType !== "r" || chebyshevDistance(finalMove.to, kingSquare) !== 1) return result("arabian", false)
  for (const knightSquare of attackers(game, attackerColor, finalMove.to)) {
    const knight = game.get(knightSquare)
    const [knightFile, knightRank] = point(knightSquare)
    if (knight?.type === "n" && Math.abs(knightRank - kingRank) === 2 && Math.abs(knightFile - kingFile) === 2) return result("arabian", true, { kingSquare, rookSquare: finalMove.to, knightSquare })
  }
  return result("arabian", false)
}

function detectBishopFamily(context) {
  const { game, attackerColor, kingSquare } = context
  const bishops = allSquares().filter((square) => game.get(square)?.color === attackerColor && game.get(square)?.type === "b")
  if (bishops.length < 2) return null
  for (const square of allSquares().filter((square) => chebyshevDistance(square, kingSquare) < 2)) {
    if (!attackers(game, attackerColor, square).every((attacker) => game.get(attacker)?.type === "b")) return null
  }
  const [kingFile] = point(kingSquare)
  const [firstFile] = point(bishops[0])
  const [secondFile] = point(bishops[1])
  return (firstFile < kingFile) === (secondFile > kingFile) ? "boden" : "double-bishop"
}

function detectDovetail(context) {
  const { game, attackerColor, kingSquare, finalMove, movedPieceType } = context
  const [kingFile, kingRank] = point(kingSquare)
  if ([0, 7].includes(kingFile) || [0, 7].includes(kingRank) || movedPieceType !== "q") return result("dovetail", false)
  const [queenFile, queenRank] = point(finalMove.to)
  if (queenFile === kingFile || queenRank === kingRank || chebyshevDistance(finalMove.to, kingSquare) > 1) return result("dovetail", false)
  for (const square of allSquares().filter((square) => chebyshevDistance(square, kingSquare) === 1 && square !== finalMove.to)) {
    const squareAttackers = attackers(game, attackerColor, square)
    if (squareAttackers.length === 1 && squareAttackers[0] === finalMove.to) {
      if (game.get(square)) return result("dovetail", false)
    } else if (squareAttackers.length) return result("dovetail", false)
  }
  return result("dovetail", true, { kingSquare, queenSquare: finalMove.to })
}

function detectKillBox(context) {
  const { game, attackerColor, kingSquare, finalMove, movedPieceType } = context
  const queens = allSquares().filter((square) => game.get(square)?.color === attackerColor && game.get(square)?.type === "q")
  const rooks = allSquares().filter((square) => game.get(square)?.color === attackerColor && game.get(square)?.type === "r")
  const queenSupportsMate = queens.some((square) => attacksSquare(game, square, finalMove.to))
  const rookFencesKing = rooks.some((square) => chebyshevDistance(square, kingSquare) === 1)
  const distance = chebyshevDistance(finalMove.to, kingSquare)
  if (movedPieceType === "r" && distance === 1 && queenSupportsMate) return result("kill-box-adjacent-rook", true, { kingSquare, matingPiece: finalMove.to })
  if (movedPieceType === "r" && distance === 2 && queenSupportsMate) return result("kill-box-rook-rail", true, { kingSquare, matingPiece: finalMove.to })
  if (movedPieceType === "q" && distance === 1 && rookFencesKing) return result("kill-box-queen-fence", true, { kingSquare, matingPiece: finalMove.to })
  return null
}

export const MATE_THEME_ORDER = ["smothered", "back-rank", "anastasia", "hook", "arabian", "boden", "double-bishop", "dovetail"]
export const ALL_MATE_THEME_KEYS = [...MATE_THEME_ORDER, "kill-box-adjacent-rook", "kill-box-rook-rail", "kill-box-queen-fence"]

export function detectAllMateThemes(record) {
  try {
    const context = terminalContext(record)
    if (context.matched === false) return Object.fromEntries(ALL_MATE_THEME_KEYS.map((theme) => [theme, result(theme, false, null, context.reason)]))
    const smothered = detectSmotheredMateAtTerminal(context.game)
    const bishopFamily = detectBishopFamily(context)
    const killBox = detectKillBox(context)
    const results = {
      smothered: result("smothered", smothered.matched, smothered.evidence, smothered.reason),
      "back-rank": detectBackRank(context),
      anastasia: detectAnastasia(context),
      hook: detectHook(context),
      arabian: detectArabian(context),
      boden: result("boden", bishopFamily === "boden", bishopFamily ? { family: bishopFamily } : null),
      "double-bishop": result("double-bishop", bishopFamily === "double-bishop", bishopFamily ? { family: bishopFamily } : null),
      dovetail: detectDovetail(context),
      "kill-box-adjacent-rook": result("kill-box-adjacent-rook", killBox?.theme === "kill-box-adjacent-rook", killBox?.evidence ?? null),
      "kill-box-rook-rail": result("kill-box-rook-rail", killBox?.theme === "kill-box-rook-rail", killBox?.evidence ?? null),
      "kill-box-queen-fence": result("kill-box-queen-fence", killBox?.theme === "kill-box-queen-fence", killBox?.evidence ?? null),
    }
    return results
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Object.fromEntries(ALL_MATE_THEME_KEYS.map((theme) => [theme, result(theme, false, null, `REPLAY_ERROR: ${message}`)]))
  }
}
