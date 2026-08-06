export const CSV_COLUMNS = Object.freeze([
  'PuzzleId', 'FEN', 'Moves', 'Rating', 'RatingDeviation', 'Popularity',
  'NbPlays', 'Themes', 'GameUrl', 'OpeningTags',
])

export const parseMoves = (value) => String(value ?? '').trim().split(/\s+/).filter(Boolean)

// The learner sees a source puzzle after its first move, so the remaining
// ply count determines the actual training stage.
export const actualStage = (moves) => Math.ceil((moves.length - 1) / 2)
