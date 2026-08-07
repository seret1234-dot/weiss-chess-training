import { Chess } from 'chess.js'

const parseUci = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })

function replay(record) {
  const game = new Chess(record.displayedFen), learner = game.turn(), plies = []
  for (const uci of record.sourceM2Line) {
    const before = new Chess(game.fen()), move = game.move(parseUci(uci))
    if (!move) throw new Error(`illegal stored line ${uci}`)
    plies.push({ before, after: new Chess(game.fen()), move })
  }
  return { learner, plies }
}

/**
 * A deliberately narrow, engine-required deflection: a forcing learner move
 * induces an opponent defender to leave a square it was defending, and the next
 * learner move exploits that exact lost defense. This proves mechanism, not
 * best-defense uniqueness.
 */
export function classifyDeflection(record) {
  const candidate = record.candidateAtomicThemes?.includes('Deflection') || record.atomic?.verifiedPrimary?.label === 'Deflection'
  if (!candidate) return null
  if (record.atomic?.extraction === 'TRUE_M2') return { disposition: 'UNSUPPORTED_TRUE_M2_SEQUENCE', reason: 'available stored line has no opponent response after learner move two' }
  const { learner, plies } = replay(record)
  const [forcing, response, consequence] = plies
  if (!forcing || !response || !consequence || forcing.move.color !== learner || response.move.color === learner || consequence.move.color !== learner) return { disposition: 'INVALID_GEOMETRY', reason: 'missing learner-response-learner sequence' }
  if (forcing.after.isCheckmate()) return { disposition: 'DIRECT_MATE_PRIMARY', reason: 'forcing move is checkmate' }
  const defender = response.before.get(response.move.from)
  if (!defender || defender.color === learner) return { disposition: 'INVALID_GEOMETRY', reason: 'response does not move an opponent defender' }
  if (defender.type === 'k') return { disposition: 'INVALID_GEOMETRY', reason: 'king response is check evasion, not a focused deflection' }
  const targetBefore = response.before.get(consequence.move.to)
  const defendedBefore = (response.before.attackers(consequence.move.to, defender.color) ?? []).includes(response.move.from)
  const defendedAfter = (response.after.attackers(consequence.move.to, defender.color) ?? []).includes(response.move.to)
  if (!defendedBefore || defendedAfter) return { disposition: 'INVALID_GEOMETRY', reason: 'response does not abandon defense of the exploited target' }
  const forcingIsForcing = forcing.after.isCheck() || Boolean(forcing.move.captured) || (forcing.after.attackers(response.move.from, learner) ?? []).includes(forcing.move.to)
  if (!forcingIsForcing) return { disposition: 'INVALID_GEOMETRY', reason: 'learner move does not force or attack the departing defender' }
  const exploitIsConcrete = Boolean(consequence.move.captured) && targetBefore?.color !== learner
  if (!exploitIsConcrete) return { disposition: 'INVALID_GEOMETRY', reason: 'next learner move does not capture the enemy target whose defense was abandoned' }
  return {
    disposition: 'MECHANISM_SUPPORTED_ENGINE_REQUIRED', stage: 'M1',
    evidence: {
      forcingMove: `${forcing.move.from}${forcing.move.to}`,
      defenderFrom: response.move.from,
      defenderTo: response.move.to,
      defenderType: defender.type,
      abandonedTarget: consequence.move.to,
      consequenceMove: `${consequence.move.from}${consequence.move.to}`,
      forcingKind: forcing.after.isCheck() ? 'check' : forcing.move.captured ? 'capture' : 'attack',
    },
  }
}
