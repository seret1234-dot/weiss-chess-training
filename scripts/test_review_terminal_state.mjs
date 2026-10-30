import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import {
 getGameResult,
 getTerminalGameCondition,
 terminalConditionAfterMove,
 terminalConditionAfterMoves,
 terminalReviewExplanation,
} from '../src/lib/chess/gameResult.js'

// Weekly Game 2 regression: Black's final Bd4 leaves White's king on h1 with
// no legal move and not in check. The review must describe stalemate before
// any evaluation-based explanation.
const fenBeforeBd4 = '8/8/8/4b3/8/6k1/r7/7K b - - 0 1'
const finalMove = { fenBefore: fenBeforeBd4, moveUci: 'e5d4', moveSan: 'Bd4' }

const board = new Chess(fenBeforeBd4)
board.move({ from: 'e5', to: 'd4' })
assert.equal(board.isStalemate(), true, 'Bd4 must produce stalemate')
assert.equal(board.isCheck(), false, 'the stalemated side must not be in check')
assert.equal(getGameResult(board), '1/2-1/2', 'the shared result logic must record a draw')

const terminal = terminalConditionAfterMove(finalMove)
assert.equal(terminal?.type, 'stalemate', 'review must detect stalemate after replaying Bd4')

const explanation = terminalReviewExplanation({
 terminal,
 moveSan: 'Bd4',
 bestMove: 'Be3',
 evalLossCp: 500,
 moverColor: 'black',
})
assert.match(explanation, /stalemate/i, 'terminal explanation must name stalemate')
assert.match(explanation, /Best move: Be3\./, 'terminal explanation must retain the best move')

assert.equal(
 getTerminalGameCondition(new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'))?.type,
 'checkmate',
 'checkmate must be identified before a generic explanation',
)
assert.equal(
 getTerminalGameCondition(new Chess('8/8/8/8/8/8/7k/K7 w - - 0 1'))?.type,
 'insufficient-material',
 'insufficient material must be identified before a generic explanation',
)
assert.equal(
 getTerminalGameCondition(new Chess('1r5k/8/8/8/8/8/8/K7 w - - 100 1'))?.type,
 'fifty-move-rule',
 'the 50-move draw condition must be identified before a generic explanation',
)
assert.equal(
 terminalConditionAfterMoves({
  fenBefore: new Chess().fen(),
  moves: [
   { moveSan: 'Nf3' }, { moveSan: 'Nf6' },
   { moveSan: 'Ng1' }, { moveSan: 'Ng8' },
   { moveSan: 'Nf3' }, { moveSan: 'Nf6' },
   { moveSan: 'Ng1' }, { moveSan: 'Ng8' },
  ],
 })?.type,
 'threefold-repetition',
 'threefold detection must replay the full reviewed line',
)

console.log('review terminal-state regression passed')
