import { Chess } from "chess.js"

export type MateInOneMoveInput = {
  from: string
  to: string
  promotion?: "q" | "r" | "b" | "n"
}

export type MateInOneMoveResult = {
  legal: boolean
  isCheckmate: boolean
  san: string | null
  uci: string | null
}

/**
 * Pattern Mate M1 course keys consistently end in `mate-1`. Keeping this
 * explicit prevents the alternative-answer rule from changing M2+ lines or
 * the underpromotion trainer.
 */
export function isPatternMateInOneTrainer(trainerKey: string) {
  return trainerKey.endsWith("mate-1")
}

export function acceptsPatternMateMove({
  trainerKey,
  playedUci,
  expectedUci,
  resultingPositionIsCheckmate,
}: {
  trainerKey: string
  playedUci: string
  expectedUci: string
  resultingPositionIsCheckmate: boolean
}) {
  return (
    playedUci.toLowerCase() === expectedUci.toLowerCase() ||
    (isPatternMateInOneTrainer(trainerKey) && resultingPositionIsCheckmate)
  )
}

/**
 * Validates a move from the position the learner actually sees (that is,
 * after any configured pre-move). A stored solution remains a reference for
 * hints and replay, but any legal checkmate is a correct M1 answer.
 */
export function evaluateMateInOneMove(
  fen: string,
  input: MateInOneMoveInput,
): MateInOneMoveResult {
  const game = new Chess(fen)

  try {
    const move = game.move(input)
    if (!move) {
      return { legal: false, isCheckmate: false, san: null, uci: null }
    }

    return {
      legal: true,
      isCheckmate: game.isCheckmate(),
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase(),
    }
  } catch {
    return { legal: false, isCheckmate: false, san: null, uci: null }
  }
}

export function getLegalMateInOneMoves(fen: string) {
  const game = new Chess(fen)
  const mates: Array<{ san: string; uci: string }> = []

  for (const move of game.moves({ verbose: true })) {
    game.move(move)
    if (game.isCheckmate()) {
      mates.push({
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase(),
      })
    }
    game.undo()
  }

  return mates
}
