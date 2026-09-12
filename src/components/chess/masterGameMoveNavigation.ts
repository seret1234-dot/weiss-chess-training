import { Chess } from 'chess.js'

export type ReplayMove = {
  from: string
  to: string
  promotion?: string | null
}

export function buildMovePositions(initialFen: string, moves: ReplayMove[]) {
  const replay = new Chess(initialFen)
  const positions = [replay.fen()]

  for (const move of moves) {
    replay.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || undefined,
    })
    positions.push(replay.fen())
  }

  return positions
}

export function keepMoveVisible(
  list: HTMLElement,
  activeMove: HTMLElement,
) {
  const listRect = list.getBoundingClientRect()
  const moveRect = activeMove.getBoundingClientRect()
  const visibleTop = listRect.top + list.clientTop
  const visibleBottom = visibleTop + list.clientHeight

  if (moveRect.top < visibleTop) {
    list.scrollTop += moveRect.top - visibleTop
  } else if (moveRect.bottom > visibleBottom) {
    list.scrollTop += moveRect.bottom - visibleBottom
  }
}
