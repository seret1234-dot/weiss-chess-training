import {
  type LegacyChunkProgressLike,
  type PatternMateM1CanonicalTheme,
} from "./m1LearnerCurriculum"

export const PATTERN_MATE_M2_TO_M5_LEARNER_CHUNK_SIZE = 20

export type PatternMateM2ToM5LearnerCurriculum = {
  trainerKey: string
  /** Catalog aliases are route provenance only; persisted progress always uses trainerKey. */
  catalogTrainerKeys?: readonly string[]
  theme: PatternMateM1CanonicalTheme
  mateDistance: 2 | 3 | 4 | 5
  version: "m2-v1" | "m3-v1" | "m4-v1" | "m5-v1"
  sourceDataBasePath: string
  learnerDataBasePath: string
  legacyChunkCount: number
  activeChunkCount: number
  activeChunkSize: number
}

type DefinitionInput = Omit<PatternMateM2ToM5LearnerCurriculum, "version" | "learnerDataBasePath" | "activeChunkCount"> & {
  version?: PatternMateM2ToM5LearnerCurriculum["version"]
  activeChunkCount?: number
}

const versionFor = (mateDistance: 2 | 3 | 4 | 5) => `m${mateDistance}-v1` as PatternMateM2ToM5LearnerCurriculum["version"]

function definition(input: DefinitionInput): PatternMateM2ToM5LearnerCurriculum {
  return {
    ...input,
    version: input.version ?? versionFor(input.mateDistance),
    learnerDataBasePath: `/data/learner-curricula/pattern-mates/${input.theme}-m${input.mateDistance}-v1`,
    // Lower only where the source cannot supply eight full 20-exercise chunks.
    activeChunkCount: input.activeChunkCount ?? 8,
  }
}

const sourcePath = (theme: string, mateDistance: 2 | 3 | 4 | 5) =>
  `/data/pattern-mates/${theme}/mate-in-${mateDistance}`

const definitions = [
  definition({ trainerKey: "anastasia-mate-2", theme: "anastasia", mateDistance: 2, sourceDataBasePath: "/data/lichess/mate_in_2/anastasia", legacyChunkCount: 50, activeChunkSize: 20 }),
  definition({ trainerKey: "back-rank-mate-2", theme: "back-rank", mateDistance: 2, sourceDataBasePath: sourcePath("back-rank", 2), legacyChunkCount: 50, activeChunkSize: 20 }),
  definition({ trainerKey: "arabian-mate-2", theme: "arabian", mateDistance: 2, sourceDataBasePath: sourcePath("arabian", 2), legacyChunkCount: 50, activeChunkSize: 20 }),
  definition({ trainerKey: "boden-mate-2", theme: "boden", mateDistance: 2, sourceDataBasePath: sourcePath("boden", 2), legacyChunkCount: 43, activeChunkSize: 20 }),
  definition({ trainerKey: "smothered-mate-2", theme: "smothered", mateDistance: 2, sourceDataBasePath: sourcePath("smothered", 2), legacyChunkCount: 50, activeChunkSize: 20 }),
  definition({ trainerKey: "hook-mate-2", theme: "hook", mateDistance: 2, sourceDataBasePath: sourcePath("hook", 2), legacyChunkCount: 50, activeChunkSize: 20 }),
  definition({ trainerKey: "kill-box-mate-2", theme: "kill-box", mateDistance: 2, sourceDataBasePath: sourcePath("kill-box", 2), legacyChunkCount: 50, activeChunkSize: 20 }),
  definition({ trainerKey: "dovetail-mate-2", theme: "dovetail", mateDistance: 2, sourceDataBasePath: sourcePath("dovetail", 2), legacyChunkCount: 32, activeChunkSize: 20 }),
  definition({ trainerKey: "double-bishop-mate-2", theme: "double-bishop", mateDistance: 2, sourceDataBasePath: sourcePath("double-bishop", 2), legacyChunkCount: 40, activeChunkSize: 20 }),

  definition({ trainerKey: "anastasia-mate-in-3", catalogTrainerKeys: ["anastasia-mate-3"], theme: "anastasia", mateDistance: 3, sourceDataBasePath: "/data/lichess/mate_in_3/anastasia", legacyChunkCount: 55, activeChunkSize: 20 }),
  definition({ trainerKey: "back-rank-mate-3", theme: "back-rank", mateDistance: 3, sourceDataBasePath: sourcePath("back-rank", 3), legacyChunkCount: 50, activeChunkSize: 20 }),
  definition({ trainerKey: "arabian-mate-3", theme: "arabian", mateDistance: 3, sourceDataBasePath: sourcePath("arabian", 3), legacyChunkCount: 21, activeChunkSize: 20 }),
  definition({ trainerKey: "boden-mate-3", theme: "boden", mateDistance: 3, sourceDataBasePath: sourcePath("boden", 3), legacyChunkCount: 3, activeChunkCount: 3, activeChunkSize: 20 }),
  definition({ trainerKey: "smothered-mate-3", theme: "smothered", mateDistance: 3, sourceDataBasePath: sourcePath("smothered", 3), legacyChunkCount: 50, activeChunkSize: 20 }),
  definition({ trainerKey: "hook-mate-3", theme: "hook", mateDistance: 3, sourceDataBasePath: sourcePath("hook", 3), legacyChunkCount: 33, activeChunkSize: 20 }),
  definition({ trainerKey: "kill-box-mate-3", theme: "kill-box", mateDistance: 3, sourceDataBasePath: sourcePath("kill-box", 3), legacyChunkCount: 29, activeChunkSize: 20 }),
  definition({ trainerKey: "dovetail-mate-3", theme: "dovetail", mateDistance: 3, sourceDataBasePath: sourcePath("dovetail", 3), legacyChunkCount: 8, activeChunkSize: 20 }),
  definition({ trainerKey: "double-bishop-mate-3-plus", theme: "double-bishop", mateDistance: 3, sourceDataBasePath: sourcePath("double-bishop", 3), legacyChunkCount: 6, activeChunkSize: 20 }),

  definition({ trainerKey: "anastasia-mate-in-4", catalogTrainerKeys: ["anastasia-mate-4"], theme: "anastasia", mateDistance: 4, sourceDataBasePath: "/data/lichess/mate_in_4/anastasia", legacyChunkCount: 15, activeChunkSize: 20 }),
  definition({ trainerKey: "back-rank-mate-4", theme: "back-rank", mateDistance: 4, sourceDataBasePath: sourcePath("back-rank", 4), legacyChunkCount: 50, activeChunkSize: 20 }),
  definition({ trainerKey: "arabian-mate-4", theme: "arabian", mateDistance: 4, sourceDataBasePath: sourcePath("arabian", 4), legacyChunkCount: 4, activeChunkCount: 5, activeChunkSize: 20 }),
  definition({ trainerKey: "smothered-mate-4", theme: "smothered", mateDistance: 4, sourceDataBasePath: sourcePath("smothered", 4), legacyChunkCount: 11, activeChunkSize: 20 }),
  definition({ trainerKey: "hook-mate-4", theme: "hook", mateDistance: 4, sourceDataBasePath: sourcePath("hook", 4), legacyChunkCount: 7, activeChunkSize: 20 }),
  definition({ trainerKey: "kill-box-mate-4", theme: "kill-box", mateDistance: 4, sourceDataBasePath: sourcePath("kill-box", 4), legacyChunkCount: 6, activeChunkCount: 7, activeChunkSize: 20 }),
  definition({ trainerKey: "dovetail-mate-4", theme: "dovetail", mateDistance: 4, sourceDataBasePath: sourcePath("dovetail", 4), legacyChunkCount: 2, activeChunkCount: 1, activeChunkSize: 20 }),

  definition({ trainerKey: "anastasia-mate-in-5", catalogTrainerKeys: ["anastasia-mate-5"], theme: "anastasia", mateDistance: 5, sourceDataBasePath: "/data/lichess/mate_in_5/anastasia", legacyChunkCount: 2, activeChunkCount: 2, activeChunkSize: 20 }),
  definition({ trainerKey: "back-rank-mate-5", theme: "back-rank", mateDistance: 5, sourceDataBasePath: sourcePath("back-rank", 5), legacyChunkCount: 13, activeChunkSize: 20 }),
  definition({ trainerKey: "arabian-mate-5", theme: "arabian", mateDistance: 5, sourceDataBasePath: sourcePath("arabian", 5), legacyChunkCount: 1, activeChunkCount: 1, activeChunkSize: 20 }),
  definition({ trainerKey: "hook-mate-5", theme: "hook", mateDistance: 5, sourceDataBasePath: sourcePath("hook", 5), legacyChunkCount: 2, activeChunkCount: 2, activeChunkSize: 20 }),
  definition({ trainerKey: "kill-box-mate-5", theme: "kill-box", mateDistance: 5, sourceDataBasePath: sourcePath("kill-box", 5), legacyChunkCount: 2, activeChunkCount: 1, activeChunkSize: 20 }),
  definition({ trainerKey: "dovetail-mate-5", theme: "dovetail", mateDistance: 5, sourceDataBasePath: sourcePath("dovetail", 5), legacyChunkCount: 1, activeChunkCount: 1, activeChunkSize: 9 }),
] as const satisfies readonly PatternMateM2ToM5LearnerCurriculum[]

export const PATTERN_MATE_M2_TO_M5_LEARNER_CURRICULA = definitions

export function getPatternMateM2ToM5LearnerCurriculum(trainerKey: string) {
  return definitions.find((entry) => entry.trainerKey === trainerKey || entry.catalogTrainerKeys?.includes(trainerKey)) ?? null
}

export function getPatternMateM2ToM5LearnerCurriculaForDistance(mateDistance: number) {
  return definitions.filter((entry) => entry.mateDistance === mateDistance)
}

export function getM2ToM5LearnerProgressTrainerKey(definitionOrTrainerKey: PatternMateM2ToM5LearnerCurriculum | string) {
  const definition = typeof definitionOrTrainerKey === "string"
    ? getPatternMateM2ToM5LearnerCurriculum(definitionOrTrainerKey)
    : definitionOrTrainerKey
  return definition ? `${definition.trainerKey}:${definition.version}` : String(definitionOrTrainerKey)
}

export function mapLegacyM2ToM5ChunkIndexToLearnerChunk(legacyChunkIndex: number, definition: Pick<PatternMateM2ToM5LearnerCurriculum, "legacyChunkCount" | "activeChunkCount">) {
  const legacyIndex = Math.max(0, Math.min(definition.legacyChunkCount - 1, Math.floor(legacyChunkIndex)))
  return Math.min(definition.activeChunkCount - 1, Math.floor((legacyIndex * definition.activeChunkCount) / definition.legacyChunkCount))
}

export function resolveM2ToM5LearnerFacingChunkIndex(requestedChunkIndex: number, definition: PatternMateM2ToM5LearnerCurriculum | null, isLearnerFacingRequest = false) {
  if (!definition) return Math.max(0, Math.floor(requestedChunkIndex))
  const requested = Math.max(0, Math.floor(requestedChunkIndex))
  return isLearnerFacingRequest
    ? Math.min(definition.activeChunkCount - 1, requested)
    : mapLegacyM2ToM5ChunkIndexToLearnerChunk(requested, definition)
}

export function getM2ToM5LegacyCompletionCredit(rows: LegacyChunkProgressLike[], definition: PatternMateM2ToM5LearnerCurriculum) {
  const completed = rows.filter((row) => {
    const chunk = Number(row.chunk_index)
    return row.is_mastered === true && Number.isInteger(chunk) && chunk >= 1 && chunk <= definition.legacyChunkCount
  })
  const legacyPuzzleCredit = completed.reduce((total, row) => total + Math.max(Math.floor(Number(row.mastered_puzzles_count) || 0), 30), 0)
  const volumeCredit = Math.min(definition.activeChunkCount, Math.floor(legacyPuzzleCredit / definition.activeChunkSize))
  const bandCredit = new Set(completed.map((row) => mapLegacyM2ToM5ChunkIndexToLearnerChunk(Number(row.chunk_index) - 1, definition))).size
  const completedActiveChunks = Math.min(definition.activeChunkCount, Math.max(volumeCredit, bandCredit))
  return { completedActiveChunks, complete: completedActiveChunks >= definition.activeChunkCount, legacyPuzzleCredit }
}

export function getM2ToM5LearnerCompletionByTrainer(rows: Array<LegacyChunkProgressLike & { trainer_key?: string | null }>) {
  return Object.fromEntries(definitions.map((definition) => {
    const legacy = getM2ToM5LegacyCompletionCredit(rows.filter((row) => row.trainer_key === definition.trainerKey), definition)
    const learnerTrainerKey = getM2ToM5LearnerProgressTrainerKey(definition)
    const activeCompletedChunks = new Set(rows
      .filter((row) => row.trainer_key === learnerTrainerKey && row.is_mastered === true)
      .map((row) => Number(row.chunk_index))
      .filter((chunk) => Number.isInteger(chunk) && chunk >= 1 && chunk <= definition.activeChunkCount)).size
    const completedActiveChunks = Math.max(legacy.completedActiveChunks, activeCompletedChunks)
    return [definition.trainerKey, { ...legacy, completedActiveChunks, complete: completedActiveChunks >= definition.activeChunkCount }]
  })) as Record<string, ReturnType<typeof getM2ToM5LegacyCompletionCredit>>
}
