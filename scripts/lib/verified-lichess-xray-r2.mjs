import { Chess } from 'chess.js'
import { replayTrace } from './verified-lichess-replay-trace.mjs'
import { exactFamilyIdentifiers } from './verified-lichess-exact-symmetry-family-v3.mjs'

const VALUE = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 })
const NAME = Object.freeze({ p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' })
const FILES = 'abcdefgh'
const opposite = (colour) => colour === 'w' ? 'b' : 'w'

function sliderDirections(type) {
  if (type === 'b') return [[1, 1], [1, -1], [-1, 1], [-1, -1]]
  if (type === 'r') return [[1, 0], [-1, 0], [0, 1], [0, -1]]
  if (type === 'q') return [[1, 1], [1, -1], [-1, 1], [-1, 0], [-1, -1], [0, 1], [0, -1], [1, 0]]
  return []
}
function at(file, rank) { return file < 0 || file > 7 || rank < 0 || rank > 7 ? null : `${FILES[file]}${rank + 1}` }
function coordinates(square) { return [FILES.indexOf(square[0]), Number(square[1]) - 1] }
function pieces(game, colour, types = null) {
  const all = []
  for (const file of FILES) for (let rank = 1; rank <= 8; rank += 1) {
    const square = `${file}${rank}`, piece = game.get(square)
    if (piece && piece.color === colour && (!types || types.includes(piece.type))) all.push({ square, piece })
  }
  return all
}
function lines(game, colour) {
  const found = []
  for (const { square: attacker, piece } of pieces(game, colour, ['b', 'r', 'q'])) {
    const [file, rank] = coordinates(attacker)
    for (const [dx, dy] of sliderDirections(piece.type)) {
      const occupied = []
      for (let step = 1; step < 8; step += 1) {
        const square = at(file + step * dx, rank + step * dy)
        if (!square) break
        const target = game.get(square)
        if (!target) continue
        occupied.push({ square, piece: target })
        if (occupied.length === 2) break
      }
      if (occupied.length === 2) {
        const [through, rear] = occupied
        found.push({ attacker, attackerPiece: piece, through: through.square, throughPiece: through.piece, rear: rear.square, rearPiece: rear.piece, direction: `${dx},${dy}` })
      }
    }
  }
  return found
}
function identityKey(line, ids) { return [ids.get(line.attacker), ids.get(line.through), ids.get(line.rear), line.direction].join('|') }
function asMove(uci) { return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined } }
function legalCapture(game, square, colour) {
  return game.moves({ verbose: true }).some((move) => move.color === colour && move.to === square && Boolean(move.captured))
}
function forkTargets(game, colour, sourceSquare) {
  return pieces(game, opposite(colour), ['n', 'b', 'r', 'q', 'k'])
    .filter(({ square }) => (game.attackers(square, colour) ?? []).includes(sourceSquare))
    .map(({ square, piece }) => ({ square, piece: NAME[piece.type] }))
}
function competitors(state, line, learner) {
  const found = []
  if (state.givesMate) found.push('mate')
  if (state.promotionPiece) found.push('promotion')
  if (state.capturedSquare && state.capturedSquare !== state.destinationSquare) found.push('en-passant')
  const forks = forkTargets(state.after, learner, state.destinationSquare)
  if (forks.length >= 2) found.push('fork')
  if (line.rearPiece.type === 'k' && line.throughPiece.color === opposite(learner)) found.push('pin')
  if (line.throughPiece.color === opposite(learner) && VALUE[line.throughPiece.type] >= VALUE[line.rearPiece.type]) found.push('skewer')
  return { motifs: found, forks }
}
function family(source, finding) {
  return exactFamilyIdentifiers({ ...source, atomic: { extraction: finding.extraction, verifiedPrimary: { key: finding.key, label: finding.label, evidence: finding.evidence } } })
}
function finding(source, value) { return { ...value, ...family(source, value) } }
function reject(key, label, reason, extraction = null, evidence = null) { return { status: 'REJECTED', key, label, reason, ...(extraction ? { extraction } : {}), ...(evidence ? { evidence } : {}) } }
function statesFor(source) {
  const trace = replayTrace(source.sourceFen, [source.preMove, ...(source.sourceM2Line ?? [])], 1)
  const learner = trace[1]?.moverColor
  if (!learner) throw new Error('missing learner move')
  const states = trace.filter((entry) => entry.ownership === 'learner').map((entry, index) => ({ ...entry, ordinal: index + 1, before: new Chess(entry.beforeFen), after: new Chess(entry.afterFen) }))
  return { trace, learner, states }
}
function extraction(ordinal) { return ordinal === 1 ? 'EXTRACTABLE_M1' : ordinal === 2 ? 'TRUE_M2' : 'NOT_M1_EXTRACTABLE' }

/**
 * Fail-closed X-Ray Attack.  The learner must move the line attacker itself,
 * create a previously absent A-I-T relation, and leave a materially relevant
 * enemy rear target.  The stored line alone cannot prove best defence, so all
 * surviving records remain ENGINE_REQUIRED.
 */
export function classifyXrayAttackR2(source) {
  if (Number(source.sourceStage) > 2) return { status: 'WEAK_TAG_ONLY', key: 'xray-attack', label: 'X-Ray Attack', extraction: 'NOT_M1_EXTRACTABLE', reason: 'source line is beyond the supported M1/TRUE-M2 structural scope' }
  const { learner, states } = statesFor(source)
  for (const state of states) {
    const stage = extraction(state.ordinal)
    const before = new Set(lines(state.before, learner).map((line) => identityKey(line, state.beforeIds)))
    for (const line of lines(state.after, learner)) {
      if (line.rearPiece.color === learner || line.rearPiece.type === 'k' || VALUE[line.rearPiece.type] < 3) continue
      if (line.attacker !== state.destinationSquare || state.afterIds.get(line.attacker) !== state.movingPieceId) continue
      if (before.has(identityKey(line, state.afterIds))) continue
      const base = { kind: 'xray-attack-r2', xrayPresentBefore: false, xrayPresentAfter: true, attackerId: state.afterIds.get(line.attacker), interveningId: state.afterIds.get(line.through), targetId: state.afterIds.get(line.rear), lineAttacker: line.attacker, attackerPiece: NAME[line.attackerPiece.type], interveningPiece: line.through, interveningPieceType: NAME[line.throughPiece.type], rearTarget: line.rear, rearTargetPiece: NAME[line.rearPiece.type], targetValue: VALUE[line.rearPiece.type], rayDirection: line.direction, learnerMove: state.moveUci, givesCheck: state.givesCheck, givesMate: state.givesMate, cleanupOnly: Boolean(state.capturedPieceId), motifOnsetPassed: false }
      const conflict = competitors(state, line, learner)
      base.competingPrimaryMotifs = conflict.motifs
      if (state.givesMate) return reject('xray-attack', 'X-Ray Attack', 'direct-mate: a mating learner move is not focused X-Ray', stage, base)
      if (state.capturedPieceId) return reject('xray-attack', 'X-Ray Attack', 'cleanup-only: focused X-Ray R2 requires the learner move to create the line, not collect a capture', stage, base)
      if (state.givesCheck) return reject('xray-attack', 'X-Ray Attack', 'primary-ambiguous: checking line move needs a dedicated forcing-line validator', stage, base)
      if (conflict.motifs.length) return reject('xray-attack', 'X-Ray Attack', `competing-primary: ${conflict.motifs.join(', ')}`, stage, base)
      if (state.ordinal === 2 && states[0]?.movingPieceId !== state.movingPieceId) return reject('xray-attack', 'X-Ray Attack', 'motif-onset-failed: TRUE-M2 setup is not the same essential line-attacker', stage, base)
      base.motifOnsetPassed = true
      return finding(source, { status: 'ENGINE_REQUIRED', key: 'xray-attack', label: 'X-Ray Attack', extraction: stage, reason: 'causal non-checking A-I-T X-Ray created by learner line-attacker; deterministic best-defense proof required', evidence: base })
    }
  }
  return reject('xray-attack', 'X-Ray Attack', 'motif-present-before-or-no-causal-attacker-created A-I-T relation')
}

/**
 * Fail closed.  A D-I-T friendly alignment alone is not a hidden defense: the
 * stored M1/M2 continuation has no proof that the hidden line changes whether
 * the defended object can be won.  Preserve it as metadata until a dedicated
 * counterfactual-defense validator exists.
 */
export function classifyXrayDefenseR2(source) {
  if (Number(source.sourceStage) > 2) return { status: 'WEAK_TAG_ONLY', key: 'xray-defense', label: 'X-Ray Defense', extraction: 'NOT_M1_EXTRACTABLE', reason: 'source line is beyond the supported M1/TRUE-M2 structural scope' }
  const { learner, states } = statesFor(source)
  for (const state of states) {
    const stage = extraction(state.ordinal)
    const before = new Set(lines(state.before, learner).map((line) => identityKey(line, state.beforeIds)))
    for (const line of lines(state.after, learner)) {
      if (line.throughPiece.color !== learner || line.rearPiece.color !== learner) continue
      if (line.attacker !== state.destinationSquare || state.afterIds.get(line.attacker) !== state.movingPieceId) continue
      if (before.has(identityKey(line, state.afterIds))) continue
      const evidence = { kind: 'xray-defense-r2', xrayPresentBefore: false, xrayPresentAfter: true, defenderId: state.afterIds.get(line.attacker), interveningId: state.afterIds.get(line.through), targetId: state.afterIds.get(line.rear), hiddenLineDefender: line.attacker, defenderPiece: NAME[line.attackerPiece.type], interveningPiece: line.through, defendedPiece: line.rear, defendedPieceType: NAME[line.rearPiece.type], learnerMove: state.moveUci, givesCheck: state.givesCheck, givesMate: state.givesMate, cleanupOnly: Boolean(state.capturedPieceId), competingPrimaryMotifs: [], motifOnsetPassed: false }
      if (state.givesMate) return reject('xray-defense', 'X-Ray Defense', 'direct-mate: a mating learner move is not focused X-Ray Defense', stage, evidence)
      return reject('xray-defense', 'X-Ray Defense', 'primary-ambiguous: D-I-T alignment does not by itself prove hidden defense changes tactical soundness', stage, evidence)
    }
  }
  return reject('xray-defense', 'X-Ray Defense', 'no newly created hidden D-I-T alignment')
}

export function classifyXrayR2(source) { return [classifyXrayAttackR2(source), classifyXrayDefenseR2(source)] }
