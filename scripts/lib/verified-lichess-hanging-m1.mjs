import { Chess } from 'chess.js'
import { exactFamilyIdentifiers } from './verified-lichess-exact-symmetry-family-v3.mjs'

const VALUE = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 })
const NAME = Object.freeze({ p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' })
const opponent = (colour) => colour === 'w' ? 'b' : 'w'
const parseUci = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })
const material = (game, colour) => game.board().flat().reduce((sum, piece) => sum + (piece?.color === colour ? VALUE[piece.type] : 0), 0)
const compactMove = (move) => ({ uci: `${move.from}${move.to}${move.promotion ?? ''}`, san: move.san, from: move.from, to: move.to, piece: move.piece, captured: move.captured ?? null, promotion: move.promotion ?? null, flags: move.flags })

function sliderLineAttacks(game, colour) {
  const directions = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]], q: [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 0], [-1, 0], [0, 1], [0, -1]] }
  const files = 'abcdefgh', result = new Set()
  for (const row of game.board()) for (const piece of row) {
    if (!piece || piece.color !== colour || !directions[piece.type]) continue
    const file = files.indexOf(piece.square[0]), rank = Number(piece.square[1]) - 1
    for (const [dx, dy] of directions[piece.type]) {
      for (let distance = 1; distance < 8; distance += 1) {
        const f = file + dx * distance, r = rank + dy * distance
        if (f < 0 || f > 7 || r < 0 || r > 7) break
        const square = `${files[f]}${r + 1}`, target = game.get(square)
        if (!target) continue
        if (target.color !== colour) result.add(`${piece.square}|${square}`)
        break
      }
    }
  }
  return result
}
function competingMotifs(before, after, move, learner) {
  const enemy = opponent(learner), motifs = []
  const attacked = after.board().flat().filter((piece) => piece && piece.color === enemy && piece.type !== 'p').filter((piece) => (after.attackers(piece.square, learner) ?? []).includes(move.to))
  const meaningful = attacked.filter((piece) => piece.type === 'k' || VALUE[piece.type] >= 3)
  if (meaningful.length >= 2) motifs.push('fork')
  const beforeLines = sliderLineAttacks(before, learner), afterLines = sliderLineAttacks(after, learner)
  if ([...afterLines].some((line) => !beforeLines.has(line) && line.startsWith(`${move.from}|`))) motifs.push(after.isCheck() ? 'discovered-check' : 'discovered-attack')
  return motifs
}
function candidateCaptures(game, learner) {
  return game.moves({ verbose: true }).filter((move) => move.captured && move.captured !== 'k' && !move.promotion && !move.flags.includes('e')).map((move) => {
    const next = new Chess(game.fen()), played = next.move({ from: move.from, to: move.to, promotion: move.promotion })
    const recaptures = next.moves({ verbose: true }).filter((reply) => reply.captured && reply.to === move.to)
    return { move: played, targetValue: VALUE[played.captured], recaptures: recaptures.length }
  }).filter((entry) => entry.move.color === learner)
}

/**
 * Fail-closed structural discovery for a board-awareness M1 course.  Tags are
 * retained as diagnostics only; they never decide theme ownership.
 */
export function classifyHangingM1(source) {
  const game = new Chess(source.displayedFen), learner = game.turn(), line = source.sourceM2Line ?? source.moves?.slice(1) ?? []
  if (!line.length) return { status: 'REJECTED', reason: 'missing learner move' }
  const before = new Chess(game.fen()), move = game.move(parseUci(line[0]))
  if (!move) return { status: 'REJECTED', reason: 'illegal learner move' }
  if (!move.captured || move.captured === 'k') return { status: 'REJECTED', reason: 'learner move is not a non-king capture' }
  if (move.promotion) return { status: 'REJECTED', reason: 'promotion-primary' }
  if (move.flags.includes('e')) return { status: 'REJECTED', reason: 'en-passant-primary' }
  const target = before.get(move.to), after = new Chess(game.fen())
  if (!target) return { status: 'REJECTED', reason: 'captured target absent from displayed position' }
  if (after.isCheckmate()) return { status: 'REJECTED', reason: 'mate-primary' }
  const motifs = competingMotifs(before, after, move, learner)
  if (motifs.length) return { status: 'REJECTED', reason: `competing-primary:${motifs.join(',')}`, competingMotifs: motifs }
  const recaptures = after.moves({ verbose: true }).filter((reply) => reply.captured && reply.to === move.to).map(compactMove)
  const alternatives = candidateCaptures(before, learner)
  const equalOrBetterAlternative = alternatives.find((entry) => `${entry.move.from}${entry.move.to}${entry.move.promotion ?? ''}` !== `${move.from}${move.to}${move.promotion ?? ''}` && entry.targetValue >= VALUE[target.type] && entry.recaptures <= recaptures.length)
  if (equalOrBetterAlternative) return { status: 'REJECTED', reason: 'ambiguous-multiple-material-captures', alternative: compactMove(equalOrBetterAlternative.move) }
  const defenders = (before.attackers(move.to, opponent(learner)) ?? []).map((square) => ({ square, piece: before.get(square)?.type ?? null }))
  const initialMaterial = material(before, learner), immediateMaterial = material(after, learner)
  const subtype = recaptures.length ? 'Insufficiently Defended' : 'Free Piece'
  const status = recaptures.length ? 'ENGINE_REQUIRED' : 'STRUCTURALLY_VERIFIED'
  const evidence = {
    kind: 'hanging-piece', subtype, learnerMove: `${move.from}${move.to}${move.promotion ?? ''}`, learnerSan: move.san,
    attackerPiece: NAME[move.piece], attackerSquare: move.from, targetPiece: NAME[target.type], targetSquare: move.to,
    targetValue: VALUE[target.type], targetDefendersBefore: defenders, immediateLegalRecaptures: recaptures,
    givesCheck: after.isCheck(), givesMate: after.isCheckmate(), materialBefore: initialMaterial,
    materialAfterCapture: immediateMaterial, immediateMaterialDelta: immediateMaterial - initialMaterial,
    competingMotifs: motifs, sourceTags: source.rawLichessTags ?? [],
  }
  const record = { ...source, sourceM2Line: line, atomic: { extraction: 'EXTRACTABLE_M1', verifiedPrimary: { key: 'hanging-piece', label: 'Hanging Piece', evidence } } }
  const families = exactFamilyIdentifiers(record)
  return {
    status, reason: recaptures.length ? 'target has immediate legal recapture; deterministic best-defense analysis required' : 'target is already loose and can be captured with no immediate legal recapture',
    key: 'hanging-piece', label: 'Hanging Piece', extraction: 'EXTRACTABLE_M1', evidence, ...families,
  }
}

export const HANGING_VALUES = VALUE
