import { useGlobalBoard } from "./useGlobalBoard"

type Side = "white" | "black"

type Params = {
  fen: string
  orientation: Side
  setOrientation: (side: Side | ((prev: Side) => Side)) => void
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
  useGlobalBoard({
    isAvailable: !!fen,
    fen,
    suggestedColor,
    canFlip,
    onFlip: () =>
      setOrientation((prev) => (prev === "white" ? "black" : "white")),
  })
}