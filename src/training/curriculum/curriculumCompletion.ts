import {
  getOrCreateCurriculumState,
  recordCurriculumSessionEvidence,
  updateAreaProgressAfterStage,
  updateStageAggregate,
  updateTemporaryReinforcement,
  updateThemeAggregate,
} from "./curriculumPersistence"
import type { CurriculumArea } from "./curriculumTypes"

export type NormalizedCurriculumCompletion = {
  userId: string | null
  area: "mates" | "tactics"
  stageOrder: number
  canonicalTheme: string | null
  trainerKey: string
  learnerVersion: string | null
  learnerChunk: number
  route: string
  sessionId: string
  decisionId?: string | null
  eventKind: "focused" | "mixed" | "review" | "preview" | "reinforcement"
  attempts: number
  correctAttempts: number
  hintCount: number
  averageSolveMs: number | null
  mixedScope?: "unlocked" | "all"
  mixedPhase?: "identified" | "blind"
}

export type CurriculumCompletionResult = {
  recorded: boolean
  evidenceNew: boolean
  reconciled: boolean
  idempotencyKey: string | null
  masteryIncreased: boolean
  reinforcementActivated: boolean
  advanced: boolean
  reconciliationError?: string
}

export type CurriculumCompletionDependencies = {
  getOrCreate: typeof getOrCreateCurriculumState
  recordEvidence: typeof recordCurriculumSessionEvidence
  updateTheme: typeof updateThemeAggregate
  updateStage: typeof updateStageAggregate
  updateArea: typeof updateAreaProgressAfterStage
  updateReinforcement: typeof updateTemporaryReinforcement
}

const defaultDependencies: CurriculumCompletionDependencies = {
  getOrCreate: getOrCreateCurriculumState,
  recordEvidence: recordCurriculumSessionEvidence,
  updateTheme: updateThemeAggregate,
  updateStage: updateStageAggregate,
  updateArea: updateAreaProgressAfterStage,
  updateReinforcement: updateTemporaryReinforcement,
}

export function curriculumCompletionIdempotencyKey(input: NormalizedCurriculumCompletion) {
  return [
    "curriculum-v2", input.userId ?? "guest", input.trainerKey,
    input.learnerVersion ?? "legacy", input.learnerChunk,
    input.sessionId, input.decisionId ?? "manual", input.eventKind,
  ].join(":")
}

export function isCurriculumCompletionEligible(input: NormalizedCurriculumCompletion) {
  return Boolean(input.userId) && input.mixedScope !== "all" && input.attempts > 0
}

/** Rebuilds every aggregate from persisted evidence; safe after a partial write. */
export async function reconcileNormalizedCurriculumCompletion(
  input: NormalizedCurriculumCompletion,
  dependencies: CurriculumCompletionDependencies = defaultDependencies,
) {
  const errors: string[] = []
  let masteryIncreased = false
  let reinforcementActivated = false
  let advanced = false
  let stageMastered = false
  let stageUpdated = false

  if (input.eventKind === "focused" && input.canonicalTheme) {
    try {
      const theme = await dependencies.updateTheme(input.userId!, input.area, input.stageOrder, input.canonicalTheme)
      masteryIncreased ||= theme.permanentMastery
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  try {
    const stage = await dependencies.updateStage(input.userId!, input.area, input.stageOrder)
    stageUpdated = true
    stageMastered = stage.permanentMastery
    masteryIncreased ||= stage.permanentMastery
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  if (stageUpdated) {
    try {
      const area = await dependencies.updateArea(input.userId!, input.area, input.stageOrder, stageMastered)
      advanced = area.advanced
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  try {
    const reinforcement = await dependencies.updateReinforcement(input.userId!, input.area)
    reinforcementActivated = reinforcement.active
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  return { reconciled: errors.length === 0, errors, masteryIncreased, reinforcementActivated, advanced }
}

/**
 * The only write adapter used by learner trainers. Free-practice sessions are
 * intentionally skipped: they must not alter mastery, ceilings, or blind unlocks.
 */
export async function recordNormalizedCurriculumCompletion(
  input: NormalizedCurriculumCompletion,
  dependencies: CurriculumCompletionDependencies = defaultDependencies,
): Promise<CurriculumCompletionResult> {
  if (!isCurriculumCompletionEligible(input)) {
    return { recorded: false, evidenceNew: false, reconciled: true, idempotencyKey: null, masteryIncreased: false, reinforcementActivated: false, advanced: false }
  }
  const idempotencyKey = curriculumCompletionIdempotencyKey(input)
  await dependencies.getOrCreate(input.userId)
  const persisted = await dependencies.recordEvidence({
    userId: input.userId,
    idempotencyKey,
    area: input.area as CurriculumArea,
    stageOrder: input.stageOrder,
    themeKey: input.eventKind === "focused" ? input.canonicalTheme : null,
    trainerKey: input.trainerKey,
    route: input.route,
    // `mixed` is persisted identified review. `review` is persisted blind
    // review, keeping the phases distinguishable with existing enum values.
    eventKind: input.eventKind,
    attempts: input.attempts,
    correctAttempts: input.correctAttempts,
    hintCount: input.hintCount,
    averageSolveMs: input.averageSolveMs,
  })
  const reconciliation = await reconcileNormalizedCurriculumCompletion(input, dependencies)
  return {
    recorded: persisted.created,
    evidenceNew: persisted.created,
    reconciled: reconciliation.reconciled,
    idempotencyKey,
    masteryIncreased: reconciliation.masteryIncreased,
    reinforcementActivated: reconciliation.reinforcementActivated,
    advanced: reconciliation.advanced,
    reconciliationError: reconciliation.errors[0],
  }
}
