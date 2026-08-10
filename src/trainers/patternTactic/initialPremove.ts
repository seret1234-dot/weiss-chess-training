import { Chess } from 'chess.js'

export type VerifiedInitialPremove = {
 sourceFen: string
 preMove: string
 displayedFen: string
}

export type InitialPremoveReadyState = {
 boardFen: string
 activeTurn: 'w' | 'b'
 currentInteractiveLineIndex: 0
 completedLearnerMoves: 0
 awaitingOpponent: false
 boardLocked: false
}

function positionKey(fen: string) {
 return fen.trim().split(/\s+/).slice(0, 4).join(' ')
}

function parseUci(uci: string) {
 return {
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  promotion: uci.length === 5 ? uci[4] as 'q' | 'r' | 'b' | 'n' : undefined,
 }
}

/**
 * Validates the one contextual source move that precedes a verified exercise.
 * The source line itself stays separate from the learner training sequence.
 */
export function verifyInitialPremove(context: VerifiedInitialPremove) {
 const source = new Chess(context.sourceFen)
 const move = source.move(parseUci(context.preMove))
 if (!move) throw new Error(`Illegal verified initial premove ${context.preMove}`)

 if (positionKey(source.fen()) !== positionKey(context.displayedFen)) {
  throw new Error('Verified initial premove does not produce the displayed position')
 }

 return {
  sourceFen: context.sourceFen,
  preMove: context.preMove,
  displayedFen: source.fen(),
 }
}

/**
 * Produces the single post-premove state used to hand a verified exercise to
 * the learner. Keeping this transition atomic prevents a rendered premove
 * from being stranded behind a later unlock timer.
 */
export function completeInitialPremove(context: VerifiedInitialPremove): InitialPremoveReadyState {
 const verified = verifyInitialPremove(context)
 const board = new Chess(verified.sourceFen)
 const move = board.move(parseUci(verified.preMove))
 if (!move) throw new Error(`Illegal verified initial premove ${verified.preMove}`)

 if (!sameChessPosition(board.fen(), verified.displayedFen)) {
  throw new Error('Verified initial premove completion does not produce the displayed position')
 }

 return {
  boardFen: board.fen(),
  activeTurn: board.turn(),
  currentInteractiveLineIndex: 0,
  completedLearnerMoves: 0,
  awaitingOpponent: false,
  boardLocked: false,
 }
}

export function sameChessPosition(left: string, right: string) {
 return positionKey(left) === positionKey(right)
}
