import React from "react"
import { Chessboard } from "react-chessboard"
import { useSiteTheme } from "./ThemeContext"

type ChessboardProps = React.ComponentProps<typeof Chessboard>
type PromotionPiece = "q" | "r" | "b" | "n"

export default function ThemedChessboard(props: ChessboardProps) {
  const { theme, config, pieces } = useSiteTheme()
  const {
    customPieces: _pagePieces,
    customDarkSquareStyle,
    customLightSquareStyle,
    customBoardStyle,
    onPromotionPieceSelect,
    onPieceDrop,
    ...boardProps
  } = props

  const boardRadius = theme === "weiss3d" ? "6px" : "8px"
  const boardShadow =
    theme === "nobleStandard"
      ? "0 0 0 1px rgba(237,190,75,0.18), 0 18px 46px rgba(0,0,0,0.38)"
      : theme === "weiss3d"
        ? "0 18px 48px rgba(0,0,0,0.34)"
        : "0 0 0 1px rgba(255,255,255,0.08), 0 18px 42px rgba(0,0,0,0.34)"

  return (
    <Chessboard
      key={`${String(props.id ?? "chessboard")}-${theme}`}
      {...boardProps}
      // A human promotion must always be confirmed explicitly. Engine moves
      // already arrive as a complete promoted position and do not use this UI.
      autoPromoteToQueen={false}
      onPieceDrop={onPieceDrop}
      onPromotionPieceSelect={
        onPromotionPieceSelect ??
        ((piece, sourceSquare, targetSquare) => {
          if (!piece || !sourceSquare || !targetSquare || !onPieceDrop) return false

          const promotion = String(piece).toLowerCase().slice(-1) as PromotionPiece
          if (!['q', 'r', 'b', 'n'].includes(promotion)) return false

          // react-chessboard's public drop type has two arguments, but a
          // promotion picker needs to preserve the selected third value for
          // stateful game/trainer handlers.
          return (onPieceDrop as unknown as (
            from: string,
            to: string,
            promotion: PromotionPiece,
          ) => boolean)(sourceSquare, targetSquare, promotion)
        })
      }
      animationDuration={boardProps.animationDuration ?? 220}
      customPieces={pieces}
      customDarkSquareStyle={{
        ...(customDarkSquareStyle ?? {}),
        backgroundColor: config.board.dark,
      }}
      customLightSquareStyle={{
        ...(customLightSquareStyle ?? {}),
        backgroundColor: config.board.light,
      }}
      customBoardStyle={{
        borderRadius: boardRadius,
        boxShadow: boardShadow,
        ...(customBoardStyle ?? {}),
      }}
    />
  )
}
