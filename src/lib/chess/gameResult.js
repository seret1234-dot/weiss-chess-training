import { Chess } from 'chess.js'

export function getGameResult(chess) {
 if (chess.isCheckmate()) {
  return chess.turn() === 'w' ? '0-1' : '1-0'
 }

 if (chess.isDraw()) return '1/2-1/2'
 return '*'
}

export function getTerminalGameCondition(chess) {
 const sideToMove = chess.turn() === 'w' ? 'White' : 'Black'

 if (chess.isCheckmate()) {
  return {
   type: 'checkmate',
   result: getGameResult(chess),
   sideToMove,
   winner: chess.turn() === 'w' ? 'Black' : 'White',
  }
 }

 if (chess.isStalemate()) {
  return { type: 'stalemate', result: '1/2-1/2', sideToMove }
 }

 if (chess.isThreefoldRepetition()) {
  return { type: 'threefold-repetition', result: '1/2-1/2', sideToMove }
 }

 if (chess.isInsufficientMaterial()) {
  return { type: 'insufficient-material', result: '1/2-1/2', sideToMove }
 }

 if (chess.isDrawByFiftyMoves()) {
  return { type: 'fifty-move-rule', result: '1/2-1/2', sideToMove }
 }

 if (chess.isDraw()) {
  return { type: 'draw', result: '1/2-1/2', sideToMove }
 }

 return null
}

function applyPlayedMove(chess, { moveUci, moveSan }) {
 if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(moveUci || '')) {
  chess.move({
   from: moveUci.slice(0, 2),
   to: moveUci.slice(2, 4),
   promotion: moveUci[4]?.toLowerCase(),
  })
  return true
 }

 if (moveSan) {
  chess.move(moveSan)
  return true
 }

 return false
}

export function terminalConditionAfterMove({ fenBefore, moveUci, moveSan }) {
 try {
  const chess = new Chess(fenBefore)
  if (!applyPlayedMove(chess, { moveUci, moveSan })) return null

  return getTerminalGameCondition(chess)
 } catch {
  return null
 }
}

export function terminalConditionAfterMoves({ fenBefore, moves }) {
 try {
  const chess = new Chess(fenBefore)
  for (const move of moves) {
   if (!applyPlayedMove(chess, move)) return null
  }
  return getTerminalGameCondition(chess)
 } catch {
  return null
 }
}

function recommendationText(bestMove) {
 return bestMove && bestMove !== '--' && bestMove !== 'Book'
  ? ` Best move: ${bestMove}.`
  : ''
}

export function terminalReviewExplanation({
 terminal,
 moveSan,
 bestMove,
 evalLossCp = 0,
 moverColor,
}) {
 const playedMove = moveSan || 'This move'
 const winningBeforeMove =
  Number.isFinite(evalLossCp) && evalLossCp >= 200 && moverColor
   ? ` ${moverColor === 'white' ? 'White' : 'Black'} was winning before this move.`
   : ''

 switch (terminal.type) {
  case 'stalemate':
   return (
    `${playedMove} causes immediate stalemate. ${terminal.sideToMove} is not in check and has no legal moves, so the game ends in a draw.` +
    winningBeforeMove +
    ' In winning endgames, check that the opponent still has at least one legal move unless you are giving checkmate.' +
    recommendationText(bestMove)
   )
  case 'checkmate':
   return (
    `${playedMove} gives immediate checkmate. ${terminal.sideToMove} is in check and has no legal moves, so ${terminal.winner} wins.` +
    recommendationText(bestMove)
   )
  case 'threefold-repetition':
   return (
    `${playedMove} creates a threefold repetition. The same position has occurred three times, so the game is drawn.` +
    recommendationText(bestMove)
   )
  case 'insufficient-material':
   return (
    `${playedMove} leaves insufficient material for either side to checkmate, so the game is drawn.` +
    recommendationText(bestMove)
   )
  case 'fifty-move-rule':
   return (
    `${playedMove} reaches the 50-move draw condition, so the game is drawn.` +
    recommendationText(bestMove)
   )
  default:
   return (
    `${playedMove} ends the game in a draw under the chess rules.` +
    recommendationText(bestMove)
   )
 }
}
