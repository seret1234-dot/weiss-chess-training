/**
 * Versioned learner-facing overlays for deliberately narrow Mate in 1 courses.
 *
 * The large source manifests remain immutable recovery/review pools.  These
 * overlays are the only progression manifests exposed to a new learner.  The
 * relationship is deliberately data-only: legacy URLs, rows, and puzzle IDs
 * stay valid while new sessions use five curated sets.
 */
export const M1_LEARNER_CHUNK_COUNT = 5
export const M1_LEARNER_CHUNK_SIZE = 24
export const M1_LEARNER_CURRICULUM_VERSION = "m1-v1"

export type LegacyChunkProgressLike = {
  chunk_index?: number | null
  is_mastered?: boolean | null
  mastered_puzzles_count?: number | null
}

export type PatternMateM1LearnerCurriculum = {
  trainerKey: string
  theme:
    | "back-rank"
    | "anastasia"
    | "arabian"
    | "boden"
    | "smothered"
    | "hook"
    | "kill-box"
    | "dovetail"
    | "double-bishop"
  sourceDataBasePath: string
  learnerDataBasePath: string
  legacyChunkCount: number
  activeChunkCount: typeof M1_LEARNER_CHUNK_COUNT
  activeChunkSize: number
}

const curriculum = [
  {
    trainerKey: "back-rank-mate-1",
    theme: "back-rank",
    sourceDataBasePath: "/data/lichess/mate_in_1/back_rank",
    learnerDataBasePath: "/data/learner-curricula/pattern-mates/back-rank-m1-v1",
    legacyChunkCount: 167,
    activeChunkCount: M1_LEARNER_CHUNK_COUNT,
    activeChunkSize: M1_LEARNER_CHUNK_SIZE,
  },
  {
    trainerKey: "anastasia-mate-1",
    theme: "anastasia",
    sourceDataBasePath: "/data/lichess/mate_in_1/anastasia",
    learnerDataBasePath: "/data/learner-curricula/pattern-mates/anastasia-m1-v1",
    legacyChunkCount: 50,
    activeChunkCount: M1_LEARNER_CHUNK_COUNT,
    activeChunkSize: M1_LEARNER_CHUNK_SIZE,
  },
  {
    trainerKey: "arabian-mate-1",
    theme: "arabian",
    sourceDataBasePath: "/data/pattern-mates/arabian/mate-in-1",
    learnerDataBasePath: "/data/learner-curricula/pattern-mates/arabian-m1-v1",
    legacyChunkCount: 50,
    activeChunkCount: M1_LEARNER_CHUNK_COUNT,
    activeChunkSize: M1_LEARNER_CHUNK_SIZE,
  },
  {
    trainerKey: "boden-mate-1",
    theme: "boden",
    sourceDataBasePath: "/data/pattern-mates/boden/mate-in-1",
    learnerDataBasePath: "/data/learner-curricula/pattern-mates/boden-m1-v1",
    legacyChunkCount: 50,
    activeChunkCount: M1_LEARNER_CHUNK_COUNT,
    activeChunkSize: M1_LEARNER_CHUNK_SIZE,
  },
  {
    trainerKey: "smothered-mate-1",
    theme: "smothered",
    sourceDataBasePath: "/data/pattern-mates/smothered/mate-in-1",
    learnerDataBasePath: "/data/learner-curricula/pattern-mates/smothered-m1-v1",
    legacyChunkCount: 50,
    activeChunkCount: M1_LEARNER_CHUNK_COUNT,
    activeChunkSize: M1_LEARNER_CHUNK_SIZE,
  },
  {
    trainerKey: "hook-mate-1",
    theme: "hook",
    sourceDataBasePath: "/data/pattern-mates/hook/mate-in-1",
    learnerDataBasePath: "/data/learner-curricula/pattern-mates/hook-m1-v1",
    legacyChunkCount: 50,
    activeChunkCount: M1_LEARNER_CHUNK_COUNT,
    activeChunkSize: M1_LEARNER_CHUNK_SIZE,
  },
  {
    trainerKey: "kill-box-mate-1",
    theme: "kill-box",
    sourceDataBasePath: "/data/pattern-mates/kill-box/mate-in-1",
    learnerDataBasePath: "/data/learner-curricula/pattern-mates/kill-box-m1-v1",
    legacyChunkCount: 50,
    activeChunkCount: M1_LEARNER_CHUNK_COUNT,
    activeChunkSize: 20,
  },
  {
    trainerKey: "dovetail-mate-1",
    theme: "dovetail",
    sourceDataBasePath: "/data/pattern-mates/dovetail/mate-in-1",
    learnerDataBasePath: "/data/learner-curricula/pattern-mates/dovetail-m1-v1",
    legacyChunkCount: 50,
    activeChunkCount: M1_LEARNER_CHUNK_COUNT,
    activeChunkSize: 20,
  },
  {
    trainerKey: "double-bishop-mate-1",
    theme: "double-bishop",
    sourceDataBasePath: "/data/pattern-mates/double-bishop/mate-in-1",
    learnerDataBasePath: "/data/learner-curricula/pattern-mates/double-bishop-m1-v1",
    legacyChunkCount: 50,
    activeChunkCount: M1_LEARNER_CHUNK_COUNT,
    activeChunkSize: 20,
  },
] as const satisfies readonly PatternMateM1LearnerCurriculum[]

export const PATTERN_MATE_M1_LEARNER_CURRICULA = curriculum

export function getPatternMateM1LearnerCurriculum(trainerKey: string) {
  return curriculum.find((entry) => entry.trainerKey === trainerKey) ?? null
}

export function getPatternMateM1LearnerCurriculumByTheme(theme: string) {
  return curriculum.find((entry) => entry.theme === theme) ?? null
}

/**
 * V1 learner progress is deliberately namespaced. This keeps the retained
 * generated-source rows immutable while allowing five new learner chunks to
 * have their own review state.
 */
export function getM1LearnerProgressTrainerKey(trainerKey: string) {
  return getPatternMateM1LearnerCurriculum(trainerKey)
    ? `${trainerKey}:${M1_LEARNER_CURRICULUM_VERSION}`
    : trainerKey
}

/**
 * Explicit compatibility mapping for a historical zero-based source chunk.
 * Source chunks are partitioned into five stable contiguous bands; no legacy
 * URL is invalidated and no persisted row needs to be renamed.
 */
export function mapLegacyChunkIndexToLearnerChunk(
  legacyChunkIndex: number,
  definition: Pick<PatternMateM1LearnerCurriculum, "legacyChunkCount" | "activeChunkCount">,
) {
  const legacyIndex = Math.max(0, Math.min(definition.legacyChunkCount - 1, Math.floor(legacyChunkIndex)))
  return Math.min(
    definition.activeChunkCount - 1,
    Math.floor((legacyIndex * definition.activeChunkCount) / definition.legacyChunkCount),
  )
}

export function getLegacyChunkCompatibilityMap(definition: PatternMateM1LearnerCurriculum) {
  return Array.from({ length: definition.legacyChunkCount }, (_, legacyIndex) => ({
    legacyChunkIndex: legacyIndex,
    activeChunkIndex: mapLegacyChunkIndexToLearnerChunk(legacyIndex, definition),
  }))
}

/**
 * Completion credit is intentionally conservative and read-only.  A completed
 * historical chunk contributes its recorded puzzle count (or the old 30-puzzle
 * chunk default when the historical row omitted that count).  Five meaningful
 * old chunks therefore grant the full five-chunk learner curriculum, while a
 * learner with less work receives a deterministic partial credit.
 */
export function getLegacyCompletionCredit(
  rows: LegacyChunkProgressLike[],
  definition: Pick<PatternMateM1LearnerCurriculum, "legacyChunkCount" | "activeChunkCount" | "activeChunkSize">,
) {
  const completed = rows.filter((row) => {
    const chunk = Number(row.chunk_index)
    return row.is_mastered === true && Number.isInteger(chunk) && chunk >= 1 && chunk <= definition.legacyChunkCount
  })
  const legacyPuzzleCredit = completed.reduce((total, row) => {
    const recorded = Math.max(0, Math.floor(Number(row.mastered_puzzles_count) || 0))
    return total + Math.max(recorded, 30)
  }, 0)
  const volumeCredit = Math.min(definition.activeChunkCount, Math.floor(legacyPuzzleCredit / definition.activeChunkSize))
  const bandCredit = new Set(completed.map((row) =>
    mapLegacyChunkIndexToLearnerChunk(Number(row.chunk_index) - 1, definition),
  )).size
  const completedActiveChunks = Math.min(definition.activeChunkCount, Math.max(volumeCredit, bandCredit))
  return {
    completedActiveChunks,
    complete: completedActiveChunks >= definition.activeChunkCount,
    legacyPuzzleCredit,
  }
}

export function getM1LearnerCompletionByTrainer(
  rows: Array<LegacyChunkProgressLike & { trainer_key?: string | null }>,
) {
  return Object.fromEntries(curriculum.map((definition) => {
    const legacy = getLegacyCompletionCredit(
      rows.filter((row) => row.trainer_key === definition.trainerKey),
      definition,
    )
    const activeCompletedChunks = new Set(
      rows
        .filter((row) => row.trainer_key === getM1LearnerProgressTrainerKey(definition.trainerKey))
        .filter((row) => row.is_mastered === true)
        .map((row) => Number(row.chunk_index))
        .filter((chunk) => Number.isInteger(chunk) && chunk >= 1 && chunk <= definition.activeChunkCount),
    ).size
    const completedActiveChunks = Math.max(legacy.completedActiveChunks, activeCompletedChunks)
    return [definition.trainerKey, {
      ...legacy,
      completedActiveChunks,
      complete: completedActiveChunks >= definition.activeChunkCount,
    }]
  })) as Record<string, ReturnType<typeof getLegacyCompletionCredit>>
}

export function resolveLearnerFacingChunkIndex(
  requestedChunkIndex: number,
  definition: PatternMateM1LearnerCurriculum | null,
  isLearnerFacingRequest = false,
) {
  if (!definition) return Math.max(0, Math.floor(requestedChunkIndex))
  const requested = Math.max(0, Math.floor(requestedChunkIndex))
  if (isLearnerFacingRequest) {
    return Math.min(definition.activeChunkCount - 1, requested)
  }
  // Old bookmarks, scheduler rows, and localStorage state pre-date the v1
  // marker, including values 0-4, so they always use the explicit old-to-new
  // mapping. New auto routes carry learnerCurriculum=m1-v1.
  return mapLegacyChunkIndexToLearnerChunk(requested, definition)
}

export function getLearnerFacingChunkIndex(trainerKey: string, selectionIndex: number) {
  const definition = getPatternMateM1LearnerCurriculum(trainerKey)
  if (!definition) return null
  return ((Math.max(0, Math.floor(selectionIndex)) % definition.activeChunkCount) + definition.activeChunkCount) % definition.activeChunkCount
}
