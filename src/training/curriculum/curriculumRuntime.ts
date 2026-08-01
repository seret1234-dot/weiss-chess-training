import { getNextDueItem, type NextDueItem } from "../getNextDueItem"
import { buildAutoTrainingRoute, type AutoTrainingItem } from "../autoTrainingRoute"
import { supabase } from "../../lib/supabase"
import {
  getM1LearnerCompletionByTrainer,
  getM1LearnerProgressTrainerKey,
 getPatternMateM1LearnerCurriculum,
 M1_LEARNER_CURRICULUM_VERSION,
 PATTERN_MATE_M1_LEARNER_CURRICULA,
} from "../../trainers/patternMate/m1LearnerCurriculum"
import {
  getM2ToM5LearnerCompletionByTrainer,
  getM2ToM5LearnerProgressTrainerKey,
  getPatternMateM2ToM5LearnerCurriculum,
  PATTERN_MATE_M2_TO_M5_LEARNER_CURRICULA,
} from "../../trainers/patternMate/m2toM5LearnerCurriculum"
import {
  getCurriculumSelectionIndex,
  getOrCreateCurriculumState,
} from "./curriculumPersistence"
import { selectCurriculumItem } from "./selectCurriculumItem"
import type {
  CurriculumRecommendation,
  CurriculumState,
} from "./curriculumTypes"

export type CurriculumRuntimeDecision = AutoTrainingItem & {
  source: "curriculum" | "legacy"
  label: string
  explanation: string
  selectionIndex: number | null
  curriculumArea?: CurriculumRecommendation["area"]
  curriculumStage?: string
  curriculumTheme?: string | null
  curriculumEventKind?: CurriculumRecommendation["kind"]
  curriculumDecisionId?: string
  difficultyCeiling?: number
  learnerCurriculumVersion?: string | null
  fallbackReason?: string
}

type PersistedCurriculum = { curriculum: CurriculumState } | null

export type CurriculumRuntimeDependencies = {
  getState?: (userId: string) => Promise<PersistedCurriculum>
  getSelectionIndex?: (userId: string) => Promise<number>
  getLegacyItem?: (userId: string) => Promise<NextDueItem | null>
  getM1LearnerCompletion?: (userId: string) => Promise<Record<string, { complete: boolean }>>
}

async function readM1LearnerCompletion(userId: string) {
  const trainerKeys = [
    ...PATTERN_MATE_M1_LEARNER_CURRICULA.flatMap((entry) => [
    entry.trainerKey,
    getM1LearnerProgressTrainerKey(entry.trainerKey),
    ]),
    ...PATTERN_MATE_M2_TO_M5_LEARNER_CURRICULA.flatMap((entry) => [
      entry.trainerKey,
      getM2ToM5LearnerProgressTrainerKey(entry),
    ]),
  ]
  const { data, error } = await supabase
    .from("user_chunk_progress")
    .select("trainer_key, chunk_index, is_mastered, mastered_puzzles_count")
    .eq("user_id", userId)
    .in("trainer_key", trainerKeys)
  if (error) throw new Error(`Could not read Pattern Mate learner progress: ${error.message}`)
  return {
    ...getM1LearnerCompletionByTrainer(data ?? []),
    ...getM2ToM5LearnerCompletionByTrainer(data ?? []),
  }
}

function withM1LearnerCompletion(
  persisted: PersistedCurriculum,
  completion: Record<string, { complete: boolean }>,
): PersistedCurriculum {
  if (!persisted) return persisted
  const themeMastery = { ...(persisted.curriculum.themeMastery ?? {}) }
  const mateThemes = { ...(themeMastery.mates ?? {}) }
  for (const definition of PATTERN_MATE_M1_LEARNER_CURRICULA) {
    if (!completion[definition.trainerKey]?.complete) continue
    mateThemes[definition.theme] = {
      ...(mateThemes[definition.theme] ?? {}),
      mastered: true,
    }
  }
  for (const definition of PATTERN_MATE_M2_TO_M5_LEARNER_CURRICULA) {
    if (!completion[definition.trainerKey]?.complete) continue
    mateThemes[definition.theme] = {
      ...(mateThemes[definition.theme] ?? {}),
      mastered: true,
    }
  }
  return {
    ...persisted,
    curriculum: {
      ...persisted.curriculum,
      themeMastery: { ...themeMastery, mates: mateThemes },
    },
  }
}

function labelFor(recommendation: CurriculumRecommendation) {
  return `${recommendation.area.replace(/-/g, " ")} — ${recommendation.stage.replace(/-/g, " ")}`
}

export function buildCurriculumDecision(
  recommendation: CurriculumRecommendation,
  selectionIndex: number,
): CurriculumRuntimeDecision {
  const m2ToM5Learner = getPatternMateM2ToM5LearnerCurriculum(recommendation.trainerKey)
  return {
    source: "curriculum",
    route: recommendation.route,
    trainerKey: recommendation.trainerKey,
    chunkIndex: m2ToM5Learner
      ? ((selectionIndex % m2ToM5Learner.activeChunkCount) + m2ToM5Learner.activeChunkCount) % m2ToM5Learner.activeChunkCount
      : recommendation.chunkIndex,
    label: labelFor(recommendation),
    explanation: recommendation.explanation,
    selectionIndex,
    curriculumArea: recommendation.area,
    curriculumStage: recommendation.stage,
    curriculumTheme: recommendation.theme ?? null,
    curriculumEventKind: recommendation.kind,
    curriculumDecisionId: `v1-${selectionIndex}-${recommendation.trainerKey}-${recommendation.stage}-${recommendation.kind}`,
    difficultyCeiling: recommendation.difficultyCeiling,
    learnerCurriculumVersion: getPatternMateM1LearnerCurriculum(recommendation.trainerKey)
      ? M1_LEARNER_CURRICULUM_VERSION
      : m2ToM5Learner?.version ?? null,
  }
}

function fallbackDecision(item: NextDueItem, reason: unknown): CurriculumRuntimeDecision {
  const message = reason instanceof Error ? reason.message : "Curriculum mapping was unavailable."
  return {
    source: "legacy",
    route: item.route,
    trainerKey: item.trainerKey,
    chunkIndex: item.chunkIndex,
    label: item.trainerKey.replace(/-/g, " "),
    explanation: "Your existing scheduled review is being used while the curriculum decision is unavailable.",
    selectionIndex: null,
    fallbackReason: message,
  }
}

/**
 * The sole Phase 3.1 entry point for a curriculum-aware recommendation. It
 * persists only the existing lazy seed; it never records exercise evidence.
 * A failure to seed, read, or map curriculum data returns the existing legacy
 * due item rather than blocking a user's course.
 */
export async function getCurriculumDecisionForUser(
  userId: string,
  dependencies: CurriculumRuntimeDependencies = {},
): Promise<CurriculumRuntimeDecision | null> {
  const getState = dependencies.getState ?? getOrCreateCurriculumState
  const getSelectionIndex = dependencies.getSelectionIndex ?? getCurriculumSelectionIndex
  const getLegacyItem = dependencies.getLegacyItem ?? getNextDueItem
  const getM1LearnerCompletion = dependencies.getM1LearnerCompletion ?? readM1LearnerCompletion

  try {
    const [persistedState, selectionIndex, m1LearnerCompletion] = await Promise.all([
      getState(userId),
      getSelectionIndex(userId),
      getM1LearnerCompletion(userId),
    ])
    const persisted = withM1LearnerCompletion(persistedState, m1LearnerCompletion)
    if (!persisted?.curriculum) throw new Error("Curriculum state was unavailable.")

    const recommendation = selectCurriculumItem({
      state: persisted.curriculum,
      selectionIndex,
    })
    if (!recommendation?.route || !recommendation.trainerKey) {
      throw new Error("No eligible curriculum route is mapped for this user.")
    }

    return buildCurriculumDecision(recommendation, selectionIndex)
  } catch (error) {
    try {
      const legacy = await getLegacyItem(userId)
      return legacy ? fallbackDecision(legacy, error) : null
    } catch {
      return null
    }
  }
}

export function buildCurriculumAutoTrainingRoute(decision: CurriculumRuntimeDecision) {
  return buildAutoTrainingRoute(decision)
}
