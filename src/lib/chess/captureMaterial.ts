import { Chess } from "chess.js"

// Local exchange evidence, not an engine evaluation. Only legal recaptures
// count: a pinned defender cannot make a genuinely hanging piece safe.
export function captureMaterialLoss(
  fen: string,
  captureUci: string,
  victimColor: "w" | "b",
  values: Record<string, number>,
  // Analyze supplies the position before the candidate move so material
  // already captured by that move is credited when its piece is recaptured.
  // Other callers retain the local capture/exchange baseline.
  baselineFen: string = fen,
) {
  const empty = { loss: 0, capturedValue: 0, recaptureSan: undefined as string | undefined }
  try {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(captureUci)) return empty
    const game = new Chess(fen)
    if (game.turn() === victimColor) return empty
    const balance = (position = game) => position.board().flat().reduce((sum, piece) => {
      if (!piece) return sum
      return sum + (piece.color === victimColor ? 1 : -1) * (values[piece.type] ?? 0)
    }, 0)
    const before = balance(baselineFen === fen ? game : new Chess(baselineFen))
    const capture = game.move({
      from: captureUci.slice(0, 2), to: captureUci.slice(2, 4),
      promotion: captureUci.slice(4) || undefined,
    })
    if (!capture?.captured) return empty
    let bestBalance = balance()
    let recaptureSan: string | undefined
    for (const reply of game.moves({ verbose: true })) {
      if (!reply.captured || reply.to !== capture.to) continue
      game.move(reply.san)
      const afterRecapture = balance()
      game.undo()
      if (afterRecapture > bestBalance) {
        bestBalance = afterRecapture
        recaptureSan = reply.san
      }
    }
    return {
      loss: Math.max(0, before - bestBalance),
      capturedValue: values[capture.captured] ?? 0,
      recaptureSan,
    }
  } catch {
    return empty
  }
}
