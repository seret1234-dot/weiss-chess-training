import { Chess } from 'chess.js'

const files = ['a','b','c','d','e','f','g','h']
const squares = files.flatMap((file) => [1,2,3,4,5,6,7,8].map((rank) => `${file}${rank}`))
const asMove = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })
const copy = (map) => new Map(map)
export const serializeIds = (map) => [...map.entries()].sort(([a], [b]) => a.localeCompare(b))

export function replayTrace(sourceFen, moves, learnerStartsAt = 1) {
  const board = new Chess(sourceFen), ids = new Map(); let nextId = 0
  for (const square of squares) { const piece = board.get(square); if (piece) ids.set(square, `${piece.color}${piece.type}-${++nextId}`) }
  const trace = []
  for (let plyIndex = 0; plyIndex < moves.length; plyIndex += 1) {
    const moveUci = moves[plyIndex], sourceSquare = moveUci.slice(0, 2), destinationSquare = moveUci.slice(2, 4)
    const beforeFen = board.fen(), beforeIds = copy(ids), movingPieceId = ids.get(sourceSquare)
    if (!movingPieceId) throw new Error(`missing moving identity at ply ${plyIndex}`)
    let played; try { played = board.move(asMove(moveUci)) } catch { throw new Error(`illegal move at ply ${plyIndex}`) }
    if (!played) throw new Error(`illegal move at ply ${plyIndex}`)
    const capturedSquare = played.flags.includes('e') ? `${destinationSquare[0]}${played.color === 'w' ? Number(destinationSquare[1]) - 1 : Number(destinationSquare[1]) + 1}` : (played.captured ? destinationSquare : null)
    const capturedPieceId = capturedSquare ? ids.get(capturedSquare) ?? null : null
    ids.delete(sourceSquare); if (capturedSquare) ids.delete(capturedSquare); ids.set(destinationSquare, movingPieceId)
    if (played.flags.includes('k') || played.flags.includes('q')) { const rank = sourceSquare[1], rookFrom = played.flags.includes('k') ? `h${rank}` : `a${rank}`, rookTo = played.flags.includes('k') ? `f${rank}` : `d${rank}`, rookId = ids.get(rookFrom); if (!rookId) throw new Error(`missing castling rook identity at ply ${plyIndex}`); ids.delete(rookFrom); ids.set(rookTo, rookId) }
    const afterFen = board.fen(), afterIds = copy(ids), state = Object.freeze({ plyIndex, moveUci, moverColor: played.color, ownership: plyIndex % 2 === learnerStartsAt % 2 ? 'learner' : 'opponent', sourceSquare, destinationSquare, promotionPiece: played.promotion ?? null, beforeFen, afterFen, beforeIds, afterIds, movingPieceId, capturedPieceId, capturedSquare, givesCheck: board.isCheck(), givesMate: board.isCheckmate() })
    for (const field of ['beforeFen','afterFen','beforeIds','afterIds','movingPieceId','sourceSquare','destinationSquare','ownership']) if (state[field] == null) throw new Error(`missing ${field} at ply ${plyIndex}`)
    trace.push(state)
  }
  return trace
}
