import { hasRegressionSignal, isStageMastered } from "./curriculumMastery"
import type { CurriculumArea, CurriculumState, ThemeMastery } from "./curriculumTypes"

export type CurriculumEventKind = "focused" | "mixed" | "review" | "preview" | "reinforcement" | "transfer"
export type TransferOutcome = "passed" | "failed"

export type CurriculumSessionEvidence = {
  userId: string
  idempotencyKey: string
  area: CurriculumArea
  stageOrder: number
  themeKey?: string | null
  trainerKey: string
  route: string
  eventKind: CurriculumEventKind
  attempts: number
  correctAttempts: number
  hintCount?: number
  averageSolveMs?: number | null
  transferOutcome?: TransferOutcome | null
  occurredOn?: string
}

export type CurriculumEventAggregate = {
  attempts: number
  correctAttempts: number
  hintCount: number
  averageSolveMs: number | null
  mixedAttempts: number
  mixedCorrectAttempts: number
  sessionDays: number
  lastAttemptAt: string | null
}

const AREAS: CurriculumArea[] = [
  "mates", "tactics", "endgame-piece-mates", "endgame-studies", "openings", "master-games", "board-vision",
]

export function validateCurriculumEvent(event: CurriculumSessionEvidence) {
  if (!event.userId || !event.idempotencyKey || !event.trainerKey || !event.route.startsWith("/")) {
    throw new Error("Curriculum evidence requires a user, idempotency key, trainer, and route.")
  }
  if (!AREAS.includes(event.area)) throw new Error("Unknown curriculum area.")
  if (!Number.isInteger(event.stageOrder) || event.stageOrder < 1) throw new Error("Curriculum stage must be a positive integer.")
  if (!Number.isInteger(event.attempts) || event.attempts <= 0) throw new Error("Curriculum attempts must be positive.")
  if (!Number.isInteger(event.correctAttempts) || event.correctAttempts < 0 || event.correctAttempts > event.attempts) {
    throw new Error("Correct attempts must be between zero and attempts.")
  }
  if ((event.hintCount ?? 0) < 0 || !Number.isFinite(event.averageSolveMs ?? 0) || (event.averageSolveMs ?? 0) < 0) {
    throw new Error("Curriculum hint and solve-time values must be non-negative.")
  }
  if (event.transferOutcome && event.eventKind !== "transfer") {
    throw new Error("Transfer outcomes require a transfer event.")
  }
}

export function aggregateCurriculumEvents(events: CurriculumSessionEvidence[]): CurriculumEventAggregate {
  const attempts = events.reduce((sum, event) => sum + event.attempts, 0)
  const correctAttempts = events.reduce((sum, event) => sum + event.correctAttempts, 0)
  const hintCount = events.reduce((sum, event) => sum + (event.hintCount ?? 0), 0)
  const timed = events.filter((event) => Number.isFinite(event.averageSolveMs))
  const weightedTime = timed.reduce((sum, event) => sum + (event.averageSolveMs ?? 0) * event.attempts, 0)
  const timedAttempts = timed.reduce((sum, event) => sum + event.attempts, 0)
  const mixed = events.filter((event) => event.eventKind === "mixed")
  const sessionDays = new Set(events.map((event) => event.occurredOn ?? "").filter(Boolean)).size
  const lastAttemptAt = events.map((event) => event.occurredOn ?? "").filter(Boolean).sort().at(-1) ?? null

  return {
    attempts,
    correctAttempts,
    hintCount,
    averageSolveMs: timedAttempts ? Math.round(weightedTime / timedAttempts) : null,
    mixedAttempts: mixed.reduce((sum, event) => sum + event.attempts, 0),
    mixedCorrectAttempts: mixed.reduce((sum, event) => sum + event.correctAttempts, 0),
    sessionDays,
    lastAttemptAt,
  }
}

export function isThemeMastered(aggregate: CurriculumEventAggregate) {
  return aggregate.attempts >= 30
    && aggregate.correctAttempts / aggregate.attempts >= 0.8
    && aggregate.hintCount / aggregate.attempts < 0.35
}

export function stageMasteryFromEvidence(
  aggregate: CurriculumEventAggregate,
  themes: ThemeMastery[],
  permanentlyMastered = false,
) {
  return isStageMastered({
    attempts: aggregate.attempts,
    recentAccuracy: aggregate.attempts ? aggregate.correctAttempts / aggregate.attempts : 0,
    mixedAccuracy: aggregate.mixedAttempts ? aggregate.mixedCorrectAttempts / aggregate.mixedAttempts : 0,
    sessionDays: aggregate.sessionDays,
    permanentlyMastered,
  }, themes)
}

export function regressionReason(
  area: CurriculumArea,
  aggregate: CurriculumEventAggregate,
  state: CurriculumState,
  themes: ThemeMastery[],
) {
  if (state.failedTransferTest) return "failed_transfer_test" as const
  if ((state.repeatedFailures ?? 0) >= 3) return "repeated_failures" as const
  if (aggregate.attempts && aggregate.correctAttempts / aggregate.attempts < 0.65) return "low_accuracy" as const
  if (aggregate.attempts && aggregate.hintCount / aggregate.attempts >= 0.35) return "high_hints" as const
  if ((aggregate.averageSolveMs ?? 0) >= 90_000) return "slow_solving" as const
  return hasRegressionSignal(area, state, state.activeStages?.[area] ?? 1, themes)
    ? "low_accuracy" as const
    : null
}
