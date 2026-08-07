import { Chess } from 'chess.js'

const parse = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })
function replay(record) { const game = new Chess(record.displayedFen), learner = game.turn(), plies = []; for (const uci of record.sourceM2Line) { const before = new Chess(game.fen()), move = game.move(parse(uci)); if (!move) throw new Error(`illegal stored line ${uci}`); plies.push({ before, after: new Chess(game.fen()), move }) } return { learner, plies } }

/** A strict capture-decoy subtype: the learner induces a non-king opponent piece
 * onto a concrete square, then immediately captures that exact decoy. Broader
 * arrival-square tactics remain unavailable until a dedicated consequence proof. */
export function classifyCaptureDecoy(record) {
  const candidate = record.candidateAtomicThemes?.includes('Decoy / Attraction') || record.atomic?.verifiedPrimary?.label === 'Decoy / Attraction'
  if (!candidate) return null
  if (record.atomic?.extraction === 'TRUE_M2') return { disposition: 'UNSUPPORTED_TRUE_M2_SEQUENCE', reason: 'stored line cannot prove a post-move-two decoy consequence' }
  const { learner, plies } = replay(record), [offer, response, exploit] = plies
  if (!offer || !response || !exploit || offer.move.color !== learner || response.move.color === learner || exploit.move.color !== learner) return { disposition: 'INVALID_GEOMETRY', reason: 'missing learner-response-learner sequence' }
  if (offer.after.isCheckmate()) return { disposition: 'DIRECT_MATE_PRIMARY', reason: 'decoy offer is checkmate' }
  const decoy = response.after.get(response.move.to)
  if (!decoy || decoy.color === learner || decoy.type === 'k') return { disposition: 'INVALID_GEOMETRY', reason: 'response does not place a non-king opponent decoy on a tactical square' }
  const offerForces = offer.after.isCheck() || Boolean(offer.move.captured) || (offer.after.attackers(response.move.from, learner) ?? []).includes(offer.move.to)
  if (!offerForces) return { disposition: 'INVALID_GEOMETRY', reason: 'learner offer does not force or attack the attracted piece' }
  if (!exploit.move.captured || exploit.move.to !== response.move.to) return { disposition: 'INVALID_GEOMETRY', reason: 'next learner move does not capture the exact attracted piece' }
  return { disposition: 'MECHANISM_SUPPORTED_ENGINE_REQUIRED', stage: 'M1', evidence: { offer: `${offer.move.from}${offer.move.to}`, attractedPiece: decoy.type, attractedFrom: response.move.from, attractedTo: response.move.to, exploit: `${exploit.move.from}${exploit.move.to}` } }
}
