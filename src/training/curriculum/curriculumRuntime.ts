import { getNextDueItem, getNextDueReviewItem, type DueState, type NextDueItem } from "../getNextDueItem"
import { activityReadKeys } from '../activityIdentity'
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
  getPatternTacticLearnerCompletionByTrainer,
  getPatternTacticLearnerCurriculum,
  getPatternTacticLearnerProgressTrainerKey,
  PATTERN_TACTIC_M1_TO_M4_LEARNER_CURRICULA,
} from "../../trainers/patternTactic/m1toM4LearnerCurriculum"
import {
  getCurriculumSelectionIndex,
  getCalculationDepthSelectionIndex,
  getTacticThemeSelectionIndices,
  getOrCreateCurriculumState,
  reconcileCurriculumState,
  type CurriculumRatingReconciliation,
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
  depthSelectionIndex?: number | null
  curriculumArea?: CurriculumRecommendation["area"]
  curriculumStage?: string
  curriculumTheme?: string | null
  curriculumEventKind?: CurriculumRecommendation["kind"]
  curriculumDecisionId?: string
  difficultyCeiling?: number
  learnerCurriculumVersion?: string | null
  fallbackReason?: string
  legacyDueState?: DueState
  autoSelectionDebug?: AutoSelectionDebug
  adaptiveState?: {
    importedWeakness: string | null
    reinforcement: Record<string, { active: boolean; until: string | null }>
  }
  curriculumRating?: number
  curriculumRatingSource?: string
  ratingReconciliation?: CurriculumRatingReconciliation
}

/** A support-only explanation of the deterministic Auto choice. */
export type AutoSelectionDebug = {
  trainingRating: number
  ratingSource: string
  activePlanSection: string
  activePlanLabel: string
  chosenExercise: string
  selectionReason: string
  subjectWeights?: Record<string, number>
  areaSelectionIndex?: number | null
  depthSelectionIndex?: number | null
  importedEvidence?: string
  assessmentEvidence?: string
  sectionMultipliers?: Record<string, number>
  reinforcement?: Record<string, { active: boolean; until: string | null }>
  curriculumRating?: number
  curriculumRatingSource?: string
  ratingReconciled?: boolean
}

type PersistedCurriculum = {
  curriculum: CurriculumState
  ratingSource?: string
  ratingReconciliation?: CurriculumRatingReconciliation
} | null

export type CurriculumRuntimeDependencies = {
  getState?: (userId: string) => Promise<PersistedCurriculum>
  getSelectionIndex?: (userId: string) => Promise<number>
  getDepthSelectionIndex?: (userId: string) => Promise<number>
  getTacticThemeSelectionIndices?: (userId: string) => Promise<Partial<Record<1 | 2 | 3 | 4, number>>>
  getLegacyItem?: (userId: string) => Promise<NextDueItem | null>
  getDueReviewItem?: (userId: string) => Promise<NextDueItem | null>
  getM1LearnerCompletion?: (userId: string) => Promise<Record<string, { complete: boolean }>>
  excludedAreas?: CurriculumRecommendation["area"][]
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
    ...PATTERN_TACTIC_M1_TO_M4_LEARNER_CURRICULA.flatMap((entry) => [
      entry.trainerKey,
      getPatternTacticLearnerProgressTrainerKey(entry),
    ]),
  ]
  // Do not put every historical revision in an oversized PostgREST query URL.
  const wanted = new Set(trainerKeys.flatMap(activityReadKeys))
  const data: any[] = []
  for (let from = 0; ; from += 1000) {
    const result = await supabase.from("user_chunk_progress")
      .select("trainer_key, chunk_index, is_mastered, mastered_puzzles_count")
      .eq("user_id", userId).order('trainer_key').order('chunk_index').range(from, from + 999)
    if (result.error) throw new Error(`Could not read learner curriculum progress: ${result.error.message}`)
    data.push(...(result.data ?? []).filter(row => wanted.has(row.trainer_key)))
    if (!result.data || result.data.length < 1000) break
  }
  return {
    ...getM1LearnerCompletionByTrainer(data ?? []),
    ...getM2ToM5LearnerCompletionByTrainer(data ?? []),
    ...getPatternTacticLearnerCompletionByTrainer(data ?? []),
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
  const tacticThemes = { ...(themeMastery.tactics ?? {}) }
  for (const definition of PATTERN_TACTIC_M1_TO_M4_LEARNER_CURRICULA) {
    if (!completion[definition.trainerKey]?.complete) continue
    tacticThemes[definition.theme] = {
      ...(tacticThemes[definition.theme] ?? {}),
      mastered: true,
    }
  }
  return {
    ...persisted,
    curriculum: {
      ...persisted.curriculum,
      themeMastery: { ...themeMastery, mates: mateThemes, tactics: tacticThemes },
    },
  }
}

function labelFor(recommendation: CurriculumRecommendation) {
  return `${recommendation.area.replace(/-/g, " ")} — ${recommendation.stage.replace(/-/g, " ")}`
}

export function buildCurriculumDecision(
  recommendation: CurriculumRecommendation,
  selectionIndex: number,
  depthSelectionIndex = selectionIndex,
  state?: CurriculumState,
  ratingSource?: string,
  ratingReconciliation?: CurriculumRatingReconciliation,
): CurriculumRuntimeDecision {
  const m2ToM5Learner = getPatternMateM2ToM5LearnerCurriculum(recommendation.trainerKey)
  const tacticLearner = getPatternTacticLearnerCurriculum(recommendation.trainerKey)
  const route = recommendation.area === "board-vision"
    ? `/board-vision?placement=${recommendation.evidence.currentStage >= 8 ? "final-full-board" : recommendation.evidence.currentStage <= 1 ? "beginning" : "middle"}`
    : recommendation.route
  return {
    source: "curriculum",
    route,
    trainerKey: recommendation.trainerKey,
    chunkIndex: m2ToM5Learner
      ? ((selectionIndex % m2ToM5Learner.activeChunkCount) + m2ToM5Learner.activeChunkCount) % m2ToM5Learner.activeChunkCount
      : tacticLearner
        ? ((selectionIndex % tacticLearner.activeChunkCount) + tacticLearner.activeChunkCount) % tacticLearner.activeChunkCount
      : recommendation.chunkIndex,
    label: labelFor(recommendation),
    explanation: recommendation.explanation,
    selectionIndex,
    depthSelectionIndex,
    curriculumArea: recommendation.area,
    curriculumStage: recommendation.stage,
    curriculumTheme: recommendation.theme ?? null,
    curriculumEventKind: recommendation.kind,
    curriculumDecisionId: `v1-${selectionIndex}-${recommendation.trainerKey}-${recommendation.stage}-${recommendation.kind}`,
    difficultyCeiling: recommendation.difficultyCeiling,
    learnerCurriculumVersion: getPatternMateM1LearnerCurriculum(recommendation.trainerKey)
      ? M1_LEARNER_CURRICULUM_VERSION
      : m2ToM5Learner?.version ?? tacticLearner?.version ?? null,
    adaptiveState: state ? {
      importedWeakness: state.importedWeakness ?? null,
      reinforcement: Object.fromEntries(Object.keys(state.temporaryReinforcement ?? {}).map((area) => [area, {
        active: Boolean(state.temporaryReinforcement?.[area as keyof typeof state.temporaryReinforcement]),
        until: state.reinforcementUntil?.[area as keyof typeof state.reinforcementUntil] ?? null,
      }])),
    } : undefined,
    curriculumRating: state?.rating == null ? undefined : Number(state.rating),
    curriculumRatingSource: ratingReconciliation?.effectiveSource ?? ratingSource,
    ratingReconciliation,
  }
}

function fallbackDecision(item: NextDueItem, reason: unknown): CurriculumRuntimeDecision {
  const message = reason instanceof Error ? reason.message : "Curriculum mapping was unavailable."
  return {
    source: "legacy",
    route: item.route,
    trainerKey: item.trainerKey,
    progressTrainerKey: item.progressTrainerKey,
    learnerCurriculumVersion: item.learnerCurriculumVersion,
    chunkIndex: item.chunkIndex,
    label: item.trainerKey.replace(/-/g, " "),
    explanation: "Your existing scheduled review is being used while the curriculum decision is unavailable.",
    selectionIndex: null,
    fallbackReason: message,
    legacyDueState: item.dueState,
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
  const getState = dependencies.getState ?? (async (userId: string) => {
    const seeded = await getOrCreateCurriculumState(userId)
    try {
      const reconciled = await reconcileCurriculumState(userId)
      return reconciled ? { ...reconciled, ratingReconciliation: seeded?.ratingReconciliation } : reconciled
    } catch {
      // A reconciliation outage must not discard a valid durable state or
      // interrupt the existing curriculum/legacy scheduler fallback.
      return seeded
    }
  })
  const getSelectionIndex = dependencies.getSelectionIndex ?? getCurriculumSelectionIndex
  const getDepthSelectionIndex = dependencies.getDepthSelectionIndex ?? getCalculationDepthSelectionIndex
  const getThemeSelectionIndices = dependencies.getTacticThemeSelectionIndices ?? getTacticThemeSelectionIndices
  const getLegacyItem = dependencies.getLegacyItem ?? getNextDueItem
  const getDueReviewItem = dependencies.getDueReviewItem ?? getNextDueReviewItem
  const getM1LearnerCompletion = dependencies.getM1LearnerCompletion ?? readM1LearnerCompletion

  try {
    const [persistedState, selectionIndex, depthSelectionIndex, tacticThemeSelectionIndices, m1LearnerCompletion, dueReview] = await Promise.all([
      getState(userId),
      getSelectionIndex(userId),
      getDepthSelectionIndex(userId),
      getThemeSelectionIndices(userId),
      getM1LearnerCompletion(userId),
      getDueReviewItem(userId),
    ])
    if (dueReview) return fallbackDecision(dueReview, "Scheduled retention review is due.")
    const persisted = withM1LearnerCompletion(persistedState, m1LearnerCompletion)
    if (!persisted?.curriculum) throw new Error("Curriculum state was unavailable.")

    const recommendation = selectCurriculumItem({
      state: persisted.curriculum,
      selectionIndex,
      depthSelectionIndex,
      tacticThemeSelectionIndices,
      excludedAreas: dependencies.excludedAreas,
    })
    if (!recommendation?.route || !recommendation.trainerKey) {
      throw new Error("No eligible curriculum route is mapped for this user.")
    }

    return buildCurriculumDecision(
      recommendation,
      selectionIndex,
      depthSelectionIndex,
      persisted.curriculum,
      persisted.ratingSource,
      persisted.ratingReconciliation,
    )
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
