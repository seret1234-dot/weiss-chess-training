import { getNextDueItem, type NextDueItem } from "../getNextDueItem"
import { buildAutoTrainingRoute, type AutoTrainingItem } from "../autoTrainingRoute"
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
  fallbackReason?: string
}

type PersistedCurriculum = { curriculum: CurriculumState } | null

export type CurriculumRuntimeDependencies = {
  getState?: (userId: string) => Promise<PersistedCurriculum>
  getSelectionIndex?: (userId: string) => Promise<number>
  getLegacyItem?: (userId: string) => Promise<NextDueItem | null>
}

function labelFor(recommendation: CurriculumRecommendation) {
  return `${recommendation.area.replace(/-/g, " ")} — ${recommendation.stage.replace(/-/g, " ")}`
}

export function buildCurriculumDecision(
  recommendation: CurriculumRecommendation,
  selectionIndex: number,
): CurriculumRuntimeDecision {
  return {
    source: "curriculum",
    route: recommendation.route,
    trainerKey: recommendation.trainerKey,
    chunkIndex: recommendation.chunkIndex,
    label: labelFor(recommendation),
    explanation: recommendation.explanation,
    selectionIndex,
    curriculumArea: recommendation.area,
    curriculumStage: recommendation.stage,
    curriculumTheme: recommendation.theme ?? null,
    curriculumEventKind: recommendation.kind,
    curriculumDecisionId: `v1-${selectionIndex}-${recommendation.trainerKey}-${recommendation.stage}-${recommendation.kind}`,
    difficultyCeiling: recommendation.difficultyCeiling,
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

  try {
    const [persisted, selectionIndex] = await Promise.all([
      getState(userId),
      getSelectionIndex(userId),
    ])
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
