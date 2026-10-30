/**
 * Builds the persisted state for restarting exactly one trainer chunk.
 * The caller owns the database writes; this keeps the local resume state and
 * the list of per-puzzle records to clear in lockstep.
 */
export function createCurrentChunkResetPlan({
  savedState,
  fileName,
  currentChunkIndex,
  puzzleIds,
}) {
  if (!fileName) throw new Error('A chunk file name is required to restart progression.')

  const uniquePuzzleIds = [...new Set(puzzleIds.filter(Boolean))]
  const emptyProgress = puzzleIds.map(() => 0)

  return {
    chunkNumber: currentChunkIndex + 1,
    puzzleIds: uniquePuzzleIds,
    emptyProgress,
    savedState: {
      ...savedState,
      currentChunkIndex,
      currentPuzzleIndex: 0,
      // Browser state is account-scoped by the trainer storage key. Keep an
      // explicit boundary so a later legacy-credit migration cannot mistake
      // this deliberately reset chunk for an untouched one.
      resetChunkIndexes: [...new Set([
        ...(savedState.resetChunkIndexes ?? []),
        currentChunkIndex,
      ])].filter((index) => Number.isInteger(index) && index >= 0),
      chunkProgressByFile: {
        ...savedState.chunkProgressByFile,
        [fileName]: emptyProgress,
      },
    },
  }
}
