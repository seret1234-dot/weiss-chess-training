import { useMemo } from 'react'

export function useSoftChessPieces() {
  return useMemo(() => {
    const pieces: Record<string, ({ squareWidth }: { squareWidth: number }) => JSX.Element> = {}

    const pieceTypes = [
      'wP', 'wN', 'wB', 'wR', 'wQ', 'wK',
      'bP', 'bN', 'bB', 'bR', 'bQ', 'bK',
    ]

    pieceTypes.forEach((type) => {
      pieces[type] = ({ squareWidth }: { squareWidth: number }) => (
        <img
          src={`/pieces/${type}.svg`}
          alt={type}
          draggable={false}
          style={{
            width: squareWidth,
            height: squareWidth,
            opacity: 0.86,
            filter: 'saturate(88%) brightness(0.96)',
            display: 'block',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      )
    })

    return pieces
  }, [])
}