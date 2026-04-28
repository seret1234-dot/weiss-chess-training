import { useCallback, useMemo } from "react"
import { useGlobalBoard } from "./useGlobalBoard"

type Side = "white" | "black"

type Params = {
  fen: string
  orientation: Side
  setOrientation?: (side: Side | ((prev: Side) => Side)) => void
  suggestedColor?: Side
  canFlip?: boolean
}

export function useRegisterPlayableBoard({
  fen,
  orientation,
  setOrientation,
  suggestedColor,
  canFlip = true,
}: Params) {
  const handleFlip = useCallback(() => {
    if (!setOrientation) return
    setOrientation((prev) => (prev === "white" ? "black" : "white"))
  }, [setOrientation])

  const boardState = useMemo(
    () => ({
      isAvailable: !!fen,
      fen,
      suggestedColor: suggestedColor ?? orientation,
      canFlip: canFlip && !!setOrientation,
      onFlip: setOrientation ? handleFlip : undefined,
    }),
    [fen, orientation, suggestedColor, canFlip, setOrientation, handleFlip],
  )

  useGlobalBoard(boardState)
}