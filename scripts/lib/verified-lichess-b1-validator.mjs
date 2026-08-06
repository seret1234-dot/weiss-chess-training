import { Chess } from 'chess.js'
import { exactFamilyIdentifiers } from './verified-lichess-exact-symmetry-family-v3.mjs'

const PIECE_NAME = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

const moveFromUci = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })

function materialBalance(game, perspective) {
  let own = 0
  let other = 0
  for (const rank of game.board()) for (const piece of rank) {
    if (!piece) continue
    if (piece.color === perspective) own += VALUE[piece.type]
    else other += VALUE[piece.type]
  }
  return own - other
}

function stageFor(attackerMoveOrdinal) {
  if (attackerMoveOrdinal === 1) return 'EXTRACTABLE_M1'
  if (attackerMoveOrdinal === 2) return 'TRUE_M2'
  return 'NOT_M1_EXTRACTABLE'
}

function replayAttackerMoves(record) {
  const game = new Chess(record.displayedFen)
  const attacker = game.turn()
  const startBalance = materialBalance(game, attacker)
  const attackerMoves = []

  for (let ply = 0; ply < (record.sourceM2Line ?? []).length; ply += 1) {
    const uci = record.sourceM2Line[ply]
    const before = game.fen()
    let played
    try { played = game.move(moveFromUci(uci)) } catch { return { error: `illegal stored line at ply ${ply + 1}: ${uci}` } }
    if (!played) return { error: `illegal stored line at ply ${ply + 1}: ${uci}` }
    if (played.color === attacker) {
      attackerMoves.push({
        before,
        played,
        ply,
        attackerMoveOrdinal: attackerMoves.length + 1,
        after: game.fen(),
        givesCheck: game.isCheck(),
        givesMate: game.isCheckmate(),
        givesStalemate: game.isStalemate(),
      })
    }
  }

  return { attacker, attackerMoves, finalBalance: materialBalance(game, attacker), startBalance }
}

function promotionCentrality(state, replay) {
  const materialGain = replay.finalBalance - replay.startBalance
  if (state.givesMate) return { central: true, reason: 'promotion produces checkmate', materialGain }
  if (state.givesCheck) return { central: true, reason: 'promotion gives check in the stored tactical line', materialGain }
  if (state.played.captured) return { central: true, reason: 'promotion captures material in the stored tactical line', materialGain }
  if (materialGain > 0) return { central: true, reason: 'stored tactical line finishes with a material gain', materialGain }
  return { central: false, reason: 'promotion has no structural forcing, capture, mate, or material-gain evidence', materialGain }
}

function queenAlternative(state) {
  const game = new Chess(state.before)
  const queen = game.move({ from: state.played.from, to: state.played.to, promotion: 'q' })
  if (!queen) return { proven: false, reason: 'queen alternative was unexpectedly illegal' }
  const queenMate = game.isCheckmate()
  const queenStalemate = game.isStalemate()
  if (state.givesMate && !queenMate) return { proven: true, reason: 'queen promotion misses the immediate mate', queenMate, queenStalemate }
  if (queenStalemate && !state.givesStalemate) return { proven: true, reason: 'queen promotion immediately stalemates', queenMate, queenStalemate }
  if (state.givesCheck && !game.isCheck()) return { proven: true, reason: 'queen promotion fails the required check', queenMate, queenStalemate }
  return { proven: false, reason: 'queen inferiority needs deterministic engine proof', queenMate, queenStalemate }
}

function promotionFinding(record, replay) {
  const underpromotionTagged = record.rawLichessTags?.includes('underPromotion')
  const promotionStates = replay.attackerMoves.filter(({ played }) => Boolean(played.promotion))
  if (!promotionStates.length) return { status: 'REJECTED', reason: 'no learner promotion move in the stored line' }

  const under = promotionStates.find(({ played }) => played.promotion !== 'q')
  if (underpromotionTagged) {
    if (!under) return { status: 'REJECTED', reason: 'underpromotion tag but learner promotion is queen or absent' }
    const subtype = PIECE_NAME[under.played.promotion]
    const centrality = promotionCentrality(under, replay)
    const queenProof = queenAlternative(under)
    const base = {
      extraction: stageFor(under.attackerMoveOrdinal),
      key: `${under.played.promotion}-underpromotion`,
      label: `${subtype} Underpromotion`,
      evidence: {
        kind: 'underpromotion', promotedPiece: subtype, promotionSquare: under.played.to,
        promotionMove: `${under.played.from}${under.played.to}${under.played.promotion}`,
        givesCheck: under.givesCheck, givesMate: under.givesMate, capture: Boolean(under.played.captured),
        queenInferiorityReason: queenProof.reason, materialGain: centrality.materialGain,
      },
    }
    if (!centrality.central) return { status: 'REJECTED', reason: centrality.reason, ...base }
    if (!queenProof.proven) return { status: 'ENGINE_REQUIRED', reason: queenProof.reason, ...base }
    return { status: 'STRUCTURALLY_VERIFIED', ...base }
  }

  const queen = promotionStates.find(({ played }) => played.promotion === 'q')
  if (!queen) return { status: 'REJECTED', reason: 'promotion tag has no ordinary queen promotion by the learner' }
  const centrality = promotionCentrality(queen, replay)
  if (!centrality.central) return { status: 'REJECTED', reason: centrality.reason }
  return {
    status: 'STRUCTURALLY_VERIFIED', extraction: stageFor(queen.attackerMoveOrdinal), key: 'promotion', label: 'Promotion',
    evidence: {
      kind: 'promotion', promotedPiece: 'Queen', promotionSquare: queen.played.to,
      promotionMove: `${queen.played.from}${queen.played.to}q`, givesCheck: queen.givesCheck,
      givesMate: queen.givesMate, capture: Boolean(queen.played.captured), materialGain: centrality.materialGain, centralityReason: centrality.reason,
    },
  }
}

function enPassantFinding(replay) {
  const state = replay.attackerMoves.find(({ played }) => played.flags.includes('e'))
  if (!state) return { status: 'REJECTED', reason: 'en-passant tag but no learner en-passant capture in the stored line' }
  const epSquare = state.before.split(/\s+/)[3] ?? '-'
  if (epSquare === '-') return { status: 'REJECTED', reason: 'en-passant capture lacks en-passant state in the displayed FEN' }
  const materialGain = replay.finalBalance - replay.startBalance
  const central = state.givesMate || state.givesCheck || materialGain > 0
  if (!central) return { status: 'REJECTED', reason: 'en-passant capture has no structural forcing, mate, check, or material-gain evidence' }
  return {
    status: 'STRUCTURALLY_VERIFIED', extraction: stageFor(state.attackerMoveOrdinal), key: 'en-passant', label: 'En Passant',
    evidence: {
      kind: 'en-passant', captureMove: `${state.played.from}${state.played.to}`,
      capturedPawnSquare: state.played.to[0] + state.played.from[1], enPassantSquare: epSquare,
      givesCheck: state.givesCheck, givesMate: state.givesMate, capture: true, materialGain,
      centralityReason: state.givesMate ? 'en-passant produces checkmate' : state.givesCheck ? 'en-passant gives check' : 'stored tactical line finishes with a material gain',
    },
  }
}

function toFamilyRecord(record, finding) {
  return {
    ...record,
    atomic: {
      extraction: finding.extraction,
      verifiedPrimary: { key: finding.key, label: finding.label, evidence: finding.evidence },
    },
  }
}

export function classifyB1Record(record) {
  const tags = new Set(record.rawLichessTags ?? [])
  const replay = replayAttackerMoves(record)
  const kinds = []
  if (tags.has('promotion') || tags.has('underPromotion')) kinds.push('promotion')
  if (tags.has('enPassant')) kinds.push('enPassant')
  if (!kinds.length) return []
  if (replay.error) return kinds.map((kind) => ({ kind, status: 'REJECTED', reason: replay.error }))

  return kinds.map((kind) => {
    const finding = kind === 'promotion' ? promotionFinding(record, replay) : enPassantFinding(replay)
    const candidateCategory = kind === 'promotion' && tags.has('underPromotion') ? 'underpromotion' : kind
    if (finding.status === 'REJECTED') return { kind, candidateCategory, ...finding }
    const family = exactFamilyIdentifiers(toFamilyRecord(record, finding))
    return { kind, candidateCategory, ...finding, ...family }
  })
}

export function b1RatingBand(rating) {
  const value = Number(rating)
  if (!Number.isFinite(value)) return 'unknown'
  const floor = Math.floor(value / 200) * 200
  return `${floor}-${floor + 199}`
}
