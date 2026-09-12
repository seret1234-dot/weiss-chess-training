import React, { useEffect, useId, useRef, useState } from "react"
import { Chessboard } from "react-chessboard"
import { buildBoardAccessibilityDescription, isDecorativeTransitionBoard } from "../components/chess/boardAccessibility.mjs"
import { useSiteTheme } from "./ThemeContext"

type ChessboardProps = React.ComponentProps<typeof Chessboard>
type PromotionPiece = "q" | "r" | "b" | "n"

type BoardAccessibilityProps = {
  accessibilityTitle?: string
  accessibilityInteraction?: string
  accessibilitySelectedSquare?: string | null
  accessibilityCurrentMove?: string | null
  accessibilityStatus?: string | null
}

export default function ThemedChessboard(props: ChessboardProps & BoardAccessibilityProps) {
  const descriptionId = useId()
  const { theme, config, pieces, showCoordinates } = useSiteTheme()
  const previousOrientationRef = useRef(props.boardOrientation)
  const [orientationAnnouncement, setOrientationAnnouncement] = useState("")
  const {
    customPieces: _pagePieces,
    customDarkSquareStyle,
    customLightSquareStyle,
    customBoardStyle,
    onPromotionPieceSelect,
    onPieceDrop,
    showBoardNotation: pageShowBoardNotation,
    accessibilityTitle,
    accessibilityInteraction,
    accessibilitySelectedSquare,
    accessibilityCurrentMove,
    accessibilityStatus,
    ...boardProps
  } = props

  useEffect(() => {
    if (previousOrientationRef.current === props.boardOrientation) return
    previousOrientationRef.current = props.boardOrientation
    setOrientationAnnouncement(
      `Board orientation: ${props.boardOrientation === "black" ? "Black" : "White"} at bottom.`,
    )
  }, [props.boardOrientation])

  const boardRadius = theme === "weiss3d" ? "6px" : "8px"
  const boardShadow =
    theme === "nobleStandard"
      ? "0 0 0 1px rgba(237,190,75,0.18), 0 18px 46px rgba(0,0,0,0.38)"
      : theme === "weiss3d"
        ? "0 18px 48px rgba(0,0,0,0.34)"
        : "0 0 0 1px rgba(255,255,255,0.08), 0 18px 42px rgba(0,0,0,0.34)"

  const decorative = isDecorativeTransitionBoard(props.id)
  const accessibility = buildBoardAccessibilityDescription({
    id: props.id,
    title: accessibilityTitle,
    position: props.position,
    orientation: props.boardOrientation,
    showCoordinates: showCoordinates && pageShowBoardNotation !== false,
    interactionDescription: accessibilityInteraction,
    selectedSquare: accessibilitySelectedSquare,
    currentMove: accessibilityCurrentMove,
    status: accessibilityStatus,
  })

  const board = (
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
      showBoardNotation={showCoordinates && pageShowBoardNotation !== false}
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

  return (
    <div
      className="accessible-chessboard"
      role={decorative ? undefined : "group"}
      aria-label={decorative ? undefined : accessibility.label}
      aria-describedby={decorative ? undefined : descriptionId}
      aria-hidden={decorative || undefined}
      style={{ width: typeof props.boardWidth === "number" ? props.boardWidth : "100%", maxWidth: "100%" }}
    >
      {!decorative && <span id={descriptionId} className="sr-only">{accessibility.description}</span>}
      {!decorative && (
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {orientationAnnouncement}
        </span>
      )}
      {board}
    </div>
  )
}
