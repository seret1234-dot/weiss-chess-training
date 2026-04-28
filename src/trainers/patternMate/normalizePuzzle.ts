import type {
  NormalizedPatternMatePuzzle,
  PatternMatePuzzle,
} from "./types"

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

export function normalizePuzzle(
  raw: PatternMatePuzzle,
  fallbackTheme = "Pattern Mate",
): NormalizedPatternMatePuzzle {
  if (!isNonEmptyString(raw.id)) {
    throw new Error("Puzzle is missing id")
  }

  if (!isNonEmptyString(raw.fen)) {
    throw new Error(`Puzzle ${raw.id} is missing fen`)
  }

  // support both formats
  const solutionLine = isStringArray(raw.solutionLine)
    ? raw.solutionLine
    : isStringArray((raw as any).solution)
    ? (raw as any).solution
    : []

  if (solutionLine.length === 0) {
    throw new Error(`Puzzle ${raw.id} has empty solution`)
  }

  const label =
    isNonEmptyString(raw.label)
      ? raw.label
      : isNonEmptyString((raw as any).subtheme)
      ? (raw as any).subtheme
      : "Pattern"

  return {
    id: raw.id,
    fen: raw.fen,
    preMove: undefined,
    rating: typeof raw.rating === "number" ? raw.rating : 500,
    label,
    theme: isNonEmptyString(raw.theme) ? raw.theme : fallbackTheme,
    chunkNumber: Number.isInteger((raw as any).chunk)
      ? (raw as any).chunk
      : 1,
    chunkIndex: Number.isInteger((raw as any).orderInChunk)
      ? (raw as any).orderInChunk - 1
      : 0,
    solutionLine,
    userMoveIndexes: [0],
  }
}

export function normalizePuzzleList(
  rawPuzzles: PatternMatePuzzle[],
  fallbackTheme = "Pattern Mate",
): NormalizedPatternMatePuzzle[] {
  return rawPuzzles.map((puzzle) => normalizePuzzle(puzzle, fallbackTheme))
}