export type ChunkProgressDisplayInput = {
  currentPuzzleIndex: number
  totalPuzzleCount: number
  completedPuzzleCount: number
}

/**
 * Keeps navigation (one-based puzzle position) separate from completed/mastered
 * puzzle progress. Trainer state stores the current position as a zero-based
 * array index, while the learner-facing display must never expose that index.
 */
export function getChunkProgressDisplay({
  currentPuzzleIndex,
  totalPuzzleCount,
  completedPuzzleCount,
}: ChunkProgressDisplayInput) {
  const total = Math.max(0, Math.floor(Number(totalPuzzleCount) || 0))
  const currentPuzzleNumber = total === 0
    ? 0
    : Math.min(total, Math.max(1, Math.floor(Number(currentPuzzleIndex) || 0) + 1))
  const completed = Math.min(total, Math.max(0, Math.floor(Number(completedPuzzleCount) || 0)))

  return {
    currentPuzzleNumber,
    completedPuzzleCount: completed,
    totalPuzzleCount: total,
    isFinalPuzzle: total > 0 && currentPuzzleNumber === total,
    isComplete: total > 0 && completed === total,
  }
}
