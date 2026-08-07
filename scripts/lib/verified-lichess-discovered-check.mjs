import { Chess } from 'chess.js'

const FILES = 'abcdefgh'
const opposite = (color) => color === 'w' ? 'b' : 'w'
const parseUci = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })

export function replayLearnerMoves(record) {
  const game = new Chess(record.displayedFen)
  const learner = game.turn()
  const states = []
  for (const uci of record.sourceM2Line) {
    const before = new Chess(game.fen())
    const move = game.move(parseUci(uci))
    if (!move) throw new Error(`illegal stored line ${uci}`)
    if (move.color === learner) states.push({ before, after: new Chess(game.fen()), move })
  }
  return { learner, states }
}

function kingSquare(game, color) {
  for (const file of FILES) for (let rank = 1; rank <= 8; rank += 1) {
    const square = `${file}${rank}`
    const piece = game.get(square)
    if (piece?.color === color && piece.type === 'k') return square
  }
  return null
}

function squaresBetween(a, b) {
  const ax = FILES.indexOf(a[0]), ay = Number(a[1]) - 1
  const bx = FILES.indexOf(b[0]), by = Number(b[1]) - 1
  const dx = bx - ax, dy = by - ay
  const diagonal = Math.abs(dx) === Math.abs(dy)
  const orthogonal = dx === 0 || dy === 0
  if (!diagonal && !orthogonal) return null
  const sx = Math.sign(dx), sy = Math.sign(dy), result = []
  for (let x = ax + sx, y = ay + sy; x !== bx || y !== by; x += sx, y += sy) result.push(`${FILES[x]}${y + 1}`)
  return result
}

function sliderCanUseLine(piece, from, to) {
  const dx = Math.abs(FILES.indexOf(from[0]) - FILES.indexOf(to[0]))
  const dy = Math.abs(Number(from[1]) - Number(to[1]))
  return piece.type === 'q' || (piece.type === 'r' && (dx === 0 || dy === 0)) || (piece.type === 'b' && dx === dy)
}

/**
 * Proves a revealed line check. The checking slider has not moved, the learner
 * moved the unique blocker on its line, and the line is clear afterwards.
 */
export function findDiscoveredCheck(before, after, move, learner) {
  const enemyKing = kingSquare(after, opposite(learner))
  if (!enemyKing || !after.isCheck()) return null
  const beforeCheckers = new Set(before.attackers(enemyKing, learner) ?? [])
  const afterCheckers = after.attackers(enemyKing, learner) ?? []
  const revealed = []
  for (const attacker of afterCheckers) {
    if (attacker === move.to || beforeCheckers.has(attacker)) continue
    const afterPiece = after.get(attacker), beforePiece = before.get(attacker)
    if (!afterPiece || !beforePiece || afterPiece.color !== learner || afterPiece.type !== beforePiece.type) continue
    if (!['b', 'r', 'q'].includes(afterPiece.type) || !sliderCanUseLine(afterPiece, attacker, enemyKing)) continue
    const between = squaresBetween(attacker, enemyKing)
    if (!between?.includes(move.from)) continue
    if (between.some(square => square !== move.from && before.get(square))) continue
    if (between.some(square => after.get(square))) continue
    if (!before.get(move.from) || before.get(move.from).color !== learner) continue
    revealed.push(attacker)
  }
  if (!revealed.length) return null
  const directChecker = afterCheckers.includes(move.to)
  return {
    subtype: directChecker ? 'double-check' : 'discovered-check',
    movedPiece: move.to,
    movedFrom: move.from,
    revealedAttacker: revealed[0],
    checkingPieces: afterCheckers,
    checkedKing: enemyKing,
  }
}

export function classifyDiscoveredCheck(record) {
  const candidate = record.candidateAtomicThemes?.includes('Discovered Check') || record.atomic?.verifiedPrimary?.label === 'Discovered Check'
  if (!candidate) return null
  const { learner, states } = replayLearnerMoves(record)
  const expected = record.atomic?.extraction === 'TRUE_M2' ? 2 : 1
  const state = states[expected - 1]
  if (!state) return { disposition: 'INVALID_GEOMETRY', reason: 'missing learner move for declared stage' }
  if (state.after.isCheckmate()) return { disposition: 'DIRECT_MATE_PRIMARY', reason: 'learner move is checkmate' }
  const evidence = findDiscoveredCheck(state.before, state.after, state.move, learner)
  if (!evidence) return { disposition: 'INVALID_GEOMETRY', reason: 'learner move does not reveal a distinct slider check' }
  if (evidence.subtype === 'double-check') return { disposition: 'DIFFERENT_PRIMARY', reason: 'learner move is a genuine double check', evidence }
  if (expected === 2 && findDiscoveredCheck(states[0].before, states[0].after, states[0].move, learner)) return { disposition: 'CLEANUP_ONLY', reason: 'discovered check already occurred on learner setup move', evidence }
  return { disposition: 'VALID_PRIMARY', stage: expected === 1 ? 'M1' : 'TRUE_M2', evidence }
}
