import React from "react"
import { Chessboard } from "react-chessboard"
import { useSiteTheme } from "./ThemeContext"

type ChessboardProps = React.ComponentProps<typeof Chessboard>

export default function ThemedChessboard(props: ChessboardProps) {
  const { theme, config, pieces } = useSiteTheme()
  const {
    customPieces: _pagePieces,
    customDarkSquareStyle,
    customLightSquareStyle,
    customBoardStyle,
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
