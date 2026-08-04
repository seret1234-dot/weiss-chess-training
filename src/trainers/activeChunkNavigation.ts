/**
 * Active learner chunks are indexed from zero in trainer state and route
 * provenance. Keep this separate from the legacy source-pool chunk numbers.
 */
export function getNextActiveLearnerChunkIndex(
  currentChunkIndex: number,
  activeChunkCount: number,
): number | null {
  const nextChunkIndex = currentChunkIndex + 1
  return nextChunkIndex >= 0 && nextChunkIndex < activeChunkCount
    ? nextChunkIndex
    : null
}

/**
 * Updates only learner-facing chunk provenance while preserving mixed scope,
 * phase, curriculum decisions, and any future route parameters.
 */
export function buildNextActiveLearnerChunkUrl(
  pathname: string,
  currentSearch: string,
  nextChunkIndex: number,
  learnerCurriculumVersion: string | null,
): string {
  const params = new URLSearchParams(currentSearch)
  params.set('chunk', String(nextChunkIndex))

  if (learnerCurriculumVersion) {
    params.set('learnerCurriculum', learnerCurriculumVersion)
  }

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
