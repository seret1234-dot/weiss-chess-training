import crypto from 'node:crypto'
import { Chess } from 'chess.js'

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 32)
const files = 'abcdefgh'
const squareParts = (square) => [files.indexOf(square[0]), Number(square[1]) - 1]
const squareName = ([file, rank]) => `${files[file]}${rank + 1}`
const parseUci = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? undefined })

// Only chess-valid symmetries are represented. No 90-degree, 270-degree or
// diagonal operation exists in this module.
const squareTransform = (square, transform) => {
  const [file, rank] = squareParts(square)
  if (transform === 'file') return squareName([7 - file, rank])
  if (transform === 'rank-colour') return squareName([file, 7 - rank])
  if (transform === 'rotate180-colour') return squareName([7 - file, 7 - rank])
  return square
}

const transformTurn = (turn, transform) => transform.includes('colour') ? (turn === 'w' ? 'b' : 'w') : turn
const transformColour = (colour, transform) => transform.includes('colour') ? (colour === 'w' ? 'b' : 'w') : colour

function transformCastling(castling, transform) {
  if (castling === '-') return '-'
  if (transform === 'identity') return castling
  if (transform === 'file') {
    const mapped = [...castling].map((right) => ({ K: 'Q', Q: 'K', k: 'q', q: 'k' }[right]))
    return ['K', 'Q', 'k', 'q'].filter((right) => mapped.includes(right)).join('') || '-'
  }
  if (transform === 'rank-colour') {
    const mapped = [...castling].map((right) => ({ K: 'k', Q: 'q', k: 'K', q: 'Q' }[right]))
    return ['K', 'Q', 'k', 'q'].filter((right) => mapped.includes(right)).join('') || '-'
  }
  // A 180-degree rotation maps kings off their e-files; castling semantics
  // cannot be preserved. Callers reject this transform when rights exist.
  return '-'
}

function transformedFen(fen, transform) {
  const game = new Chess(fen)
  const [,, castling = '-', ep = '-'] = fen.split(/\s+/)
  const transformed = Array.from({ length: 8 }, () => Array(8).fill(null))
  for (const rank of game.board()) {
    for (const piece of rank) {
      if (!piece) continue
      const target = squareTransform(piece.square, transform)
      const [file, targetRank] = squareParts(target)
      transformed[targetRank][file] = { type: piece.type, color: transformColour(piece.color, transform) }
    }
  }
  const board = [...transformed].reverse().map((rank) => {
    let empty = 0
    let encoded = ''
    for (const piece of rank) {
      if (!piece) { empty += 1; continue }
      if (empty) { encoded += empty; empty = 0 }
      encoded += piece.color === 'w' ? piece.type.toUpperCase() : piece.type
    }
    return `${encoded}${empty || ''}`
  }).join('/')
  const transformedCastling = transformCastling(castling, transform)
  const transformedEp = ep === '-' ? '-' : squareTransform(ep, transform)
  return `${board} ${transformTurn(game.turn(), transform)} ${transformedCastling} ${transformedEp} 0 1`
}

const transformUci = (uci, transform) => {
  const parsed = parseUci(uci)
  return `${squareTransform(parsed.from, transform)}${squareTransform(parsed.to, transform)}${parsed.promotion ?? ''}`
}

function replayableState(record, transform) {
  const sourceFields = record.displayedFen.split(/\s+/)
  const castling = sourceFields[2] ?? '-'
  if (transform === 'rotate180-colour' && castling !== '-') return null
  let fen
  try { fen = transformedFen(record.displayedFen, transform) } catch { return null }
  const line = (record.sourceM2Line ?? []).map((uci) => transformUci(uci, transform))
  let game
  try { game = new Chess(fen) } catch { return null }
  const moves = []
  try {
    for (const uci of line) {
      const played = game.move(parseUci(uci))
      moves.push({
        uci,
        capture: played.captured ?? null,
        promotion: played.promotion ?? null,
        check: game.isCheck(),
        mate: game.isCheckmate(),
      })
    }
  } catch { return null }
  if (!moves.length) return null
  const first = moves[0]
  return {
    fen,
    source: first.uci.slice(0, 2),
    destination: first.uci.slice(2, 4),
    line: moves,
    checking: first.check,
    tacticalResult: {
      firstCapture: first.capture,
      firstPromotion: first.promotion,
      firstMate: first.mate,
      finalCheck: game.isCheck(),
      finalMate: game.isCheckmate(),
    },
  }
}

function candidateTransforms(record) {
  const fields = record.displayedFen.split(/\s+/)
  const castling = fields[2] ?? '-'
  const transforms = ['identity', 'file', 'rank-colour']
  if (castling === '-') transforms.push('rotate180-colour')
  return transforms
}

function atomicSubtype(primary, evidence) {
  if (evidence.subtype) return evidence.subtype
  if (primary?.key?.includes('fork')) {
    return [evidence.givesCheck ? 'checking' : 'non-checking', evidence.royalFork ? 'royal' : null, evidence.targetValueCombination ?? null]
      .filter(Boolean).join('|') || 'fork'
  }
  if (primary?.key?.includes('pin')) return evidence.pinType ?? (evidence.absolute ? 'absolute' : 'relative')
  if (primary?.key?.includes('skewer')) return evidence.lineType ?? 'line'
  return evidence.kind ?? primary?.key ?? 'unclassified'
}

function validStates(record) {
  return candidateTransforms(record)
    .map((transform) => {
      const state = replayableState(record, transform)
      return state ? { transform, state } : null
    })
    .filter(Boolean)
}

function canonicalState(candidates, record) {
  if (!candidates.length) throw new Error(`No chess-valid symmetry state for ${record.canonicalIdentity}`)
  return candidates.sort((a, b) => JSON.stringify(a.state).localeCompare(JSON.stringify(b.state)))[0].state
}

export function exactSymmetryState(record) {
  return canonicalState(validStates(record), record)
}

export function exactSymmetryFamilyId(record) {
  // Theme-independent: equal complete positions may occur under different
  // semantic labels, but must not be treated as one pedagogical course.
  return hash(`exact-symmetry-v3|${JSON.stringify(exactSymmetryState(record))}`)
}

export function pedagogicalFamilyId(record, knownExactId = null) {
  const primary = record.atomic?.verifiedPrimary ?? {}
  const evidence = primary.evidence ?? {}
  const stage = record.atomic?.extraction ?? 'NOT_M1_EXTRACTABLE'
  return hash(`pedagogical-v3|${knownExactId ?? exactSymmetryFamilyId(record)}|${primary.key ?? 'unverified'}|${atomicSubtype(primary, evidence)}|${stage}`)
}

export function exactFamilyIdentifiers(record) {
  const candidates = validStates(record)
  const state = canonicalState(candidates, record)
  const exactId = hash(`exact-symmetry-v3|${JSON.stringify(state)}`)
  const primary = record.atomic?.verifiedPrimary ?? {}
  const evidence = primary.evidence ?? {}
  return {
    exactSymmetryFamilyId: exactId,
    pedagogicalFamilyId: pedagogicalFamilyId(record, exactId),
    canonicalThemeKey: primary.key ?? 'unverified',
    canonicalSubtype: atomicSubtype(primary, evidence),
    extraction: record.atomic?.extraction ?? 'NOT_M1_EXTRACTABLE',
    transformsConsidered: candidates.map((candidate) => candidate.transform).filter(Boolean),
  }
}
