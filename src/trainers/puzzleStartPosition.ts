import { Chess } from 'chess.js'
import { completeInitialPremove, sameChessPosition } from './patternTactic/initialPremove'

/** Prepare the learner's actual starting position without publishing a source FEN. */
export function preparePuzzleStartPosition(puzzle: {
 fen: string
 preMove?: string
 sourceFen?: string
 displayedFen?: string
}) {
 if (puzzle.preMove && puzzle.sourceFen && puzzle.displayedFen && !sameChessPosition(puzzle.sourceFen, puzzle.displayedFen)) {
  return new Chess(completeInitialPremove({
   sourceFen: puzzle.sourceFen,
   displayedFen: puzzle.displayedFen,
   preMove: puzzle.preMove,
  }).boardFen)
 }
 const board = new Chess(puzzle.fen)
 if (puzzle.preMove) {
  const uci = puzzle.preMove
  board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined })
 }
 return board
}
