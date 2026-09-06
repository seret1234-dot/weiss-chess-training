export type TrainingRatingBand = "beginner" | "intermediate" | "advanced"
export type CalculationDepth = 1 | 2 | 3 | 4

export const TRAINING_RATING_BANDS = Object.freeze({
  beginnerMaxExclusive: 1000,
  intermediateMaxExclusive: 1600,
})

export const SPACED_REPETITION_LADDER_DAYS = Object.freeze([
  1, 2, 3, 5, 8, 15, 30, 60, 100, 140, 170, 270, 365,
] as const)

export const PUZZLE_MASTERY_RULES = Object.freeze({
  qualifyingFastSolves: 5,
  firstMoveStartUnderMs: 2_000,
  eachLearnerMoveUnderMs: 3_000,
  perfectChunksToMasterUnit: 2,
  defaultChunkSize: 30,
})

/** Difficulty is deliberately independent from section priority. */
export const CALCULATION_DEPTH_DISTRIBUTIONS: Record<TrainingRatingBand, Readonly<Record<CalculationDepth, number>>> = Object.freeze({
  beginner: Object.freeze({ 1: 90, 2: 10, 3: 0, 4: 0 }),
  intermediate: Object.freeze({ 1: 35, 2: 50, 3: 15, 4: 0 }),
  advanced: Object.freeze({ 1: 15, 2: 35, 3: 35, 4: 15 }),
})

export const BOARD_VISION_PLACEMENT = Object.freeze({
  beginner: { level: "beginning", checkpoint: 0 },
  intermediate: { level: "middle", checkpoint: 4 },
  advanced: { level: "final-full-board", checkpoint: 7 },
} as const)

export type ReviewOutcome =
  | "perfect"
  | "minor-weakness"
  | "timing-failure"
  | "silent-error"
  | "wrong"

export type ReviewTransition = {
  reviewStage: number
  intervalDays: number
  activeTraining: boolean
  consecutiveFailures: number
}

export function getTrainingRatingBand(rating: number | null | undefined): TrainingRatingBand {
  const safe = Number.isFinite(Number(rating)) ? Number(rating) : 600
  if (safe < TRAINING_RATING_BANDS.beginnerMaxExclusive) return "beginner"
  if (safe < TRAINING_RATING_BANDS.intermediateMaxExclusive) return "intermediate"
  return "advanced"
}

export function getMasterGameCadenceDays(rating: number | null | undefined) {
  const band = getTrainingRatingBand(rating)
  return band === "beginner" ? 60 : band === "intermediate" ? 30 : 7
}

export function getSpacedIntervalDays(reviewStage: number) {
  const index = Math.max(0, Math.floor(Number(reviewStage) || 0))
  return SPACED_REPETITION_LADDER_DAYS[Math.min(index, SPACED_REPETITION_LADDER_DAYS.length - 1)]
}

export function applyReviewOutcome(
  currentStage: number,
  outcome: ReviewOutcome,
  priorConsecutiveFailures = 0,
): ReviewTransition {
  const stage = Math.max(0, Math.min(SPACED_REPETITION_LADDER_DAYS.length, Math.floor(Number(currentStage) || 0)))
  const failed = outcome !== "perfect"
  const consecutiveFailures = failed ? Math.max(0, priorConsecutiveFailures) + 1 : 0
  if (consecutiveFailures >= 3) {
    return { reviewStage: 0, intervalDays: 1, activeTraining: true, consecutiveFailures }
  }

  const reviewStage = outcome === "perfect"
    ? Math.min(SPACED_REPETITION_LADDER_DAYS.length, stage + 1)
    : outcome === "minor-weakness"
      ? Math.max(1, stage - 1)
      : outcome === "timing-failure" || outcome === "silent-error"
        ? Math.max(1, stage - 3)
        : 1
  const intervalDays = getSpacedIntervalDays(Math.max(0, reviewStage - 1))
  return { reviewStage, intervalDays, activeTraining: false, consecutiveFailures }
}

export function advancePerfectChunkStreak(currentStreak: number, perfect: boolean) {
  const streak = perfect ? Math.max(0, Math.floor(Number(currentStreak) || 0)) + 1 : 0
  return {
    consecutivePerfectChunks: streak,
    mastered: streak >= PUZZLE_MASTERY_RULES.perfectChunksToMasterUnit,
  }
}

export function getBoardVisionPlacement(rating: number | null | undefined, demonstratedCheckpoint?: number | null) {
  const estimated = BOARD_VISION_PLACEMENT[getTrainingRatingBand(rating)]
  const demonstrated = Number(demonstratedCheckpoint)
  if (!Number.isInteger(demonstrated) || demonstrated < 0) return estimated
  const checkpoint = Math.max(0, Math.min(7, demonstrated))
  return {
    level: checkpoint === 0 ? "beginning" : checkpoint >= 7 ? "final-full-board" : "middle",
    checkpoint,
  } as const
}

export function backtrackBoardVisionCheckpoint(currentCheckpoint: number, passed: boolean) {
  const current = Math.max(0, Math.min(7, Math.floor(Number(currentCheckpoint) || 0)))
  return passed ? Math.min(7, current + 1) : Math.max(0, current - (current >= 7 ? 3 : 2))
}

/** Smooth deterministic allocation: no random/hashed jumps, and M1 never disappears. */
export function buildDifficultyCycle(rating: number | null | undefined): CalculationDepth[] {
  const weights = CALCULATION_DEPTH_DISTRIBUTIONS[getTrainingRatingBand(rating)]
  const served: Record<CalculationDepth, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  const depths: CalculationDepth[] = [1, 2, 3, 4]
  const cycle: CalculationDepth[] = []
  for (let slot = 0; slot < 100; slot += 1) {
    const eligible = depths.filter((depth) => weights[depth] > 0)
    const selected = eligible.slice().sort((a, b) => {
      const aDeficit = ((slot + 1) * weights[a] / 100) - served[a]
      const bDeficit = ((slot + 1) * weights[b] / 100) - served[b]
      return bDeficit - aDeficit || a - b
    })[0]
    served[selected] += 1
    cycle.push(selected)
  }
  return cycle
}

export function selectCalculationDepth(rating: number | null | undefined, completedSelections: number) {
  const cycle = buildDifficultyCycle(rating)
  const index = Math.max(0, Math.floor(Number(completedSelections) || 0)) % cycle.length
  return cycle[index]
}

export function selectWeightedPriorityKey<T extends string>(
  orderedKeys: readonly T[],
  weights: Readonly<Record<T, number>>,
  completedSelections: number,
  excluded: readonly T[] = [],
) {
  const blocked = new Set(excluded)
  const keys = orderedKeys.filter((key) => !blocked.has(key) && weights[key] > 0)
  if (!keys.length) return null
  const total = keys.reduce((sum, key) => sum + weights[key], 0)
  const served = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>
  const cycle: T[] = []
  for (let slot = 0; slot < total; slot += 1) {
    const selected = keys.slice().sort((a, b) => {
      const aDeficit = ((slot + 1) * weights[a] / total) - served[a]
      const bDeficit = ((slot + 1) * weights[b] / total) - served[b]
      return bDeficit - aDeficit || keys.indexOf(a) - keys.indexOf(b)
    })[0]
    served[selected] += 1
    cycle.push(selected)
  }
  const index = Math.max(0, Math.floor(Number(completedSelections) || 0)) % cycle.length
  return cycle[index]
}

export type OpeningTrack = {
  key: string
  side: "white" | "black-vs-e4" | "black-vs-d4" | "black-other"
  count: number
  averageScore: number | null
}

function openingRows(value: unknown) {
  return Array.isArray(value) ? value : []
}

function normalizeOpeningRow(row: any, side: OpeningTrack["side"]): OpeningTrack | null {
  const key = String(row?.key ?? row?.name ?? "").trim()
  if (!key) return null
  const count = Math.max(0, Math.floor(Number(row?.count) || 0))
  const average = Number(row?.avgScore)
  return { key, side, count, averageScore: Number.isFinite(average) ? average : null }
}

export function buildActiveOpeningTracks(profile: any, rating: number | null | undefined): OpeningTrack[] {
  const white = openingRows(profile?.white).map((row) => normalizeOpeningRow(row, "white")).filter(Boolean) as OpeningTrack[]
  const black = openingRows(profile?.black).map((row) => {
    const key = String(row?.key ?? row?.name ?? "").trim().toLowerCase()
    const side: OpeningTrack["side"] = /(^|\s|\.)e4(\s|$)/.test(key)
      ? "black-vs-e4"
      : /(^|\s|\.)d4(\s|$)/.test(key)
        ? "black-vs-d4"
        : "black-other"
    return normalizeOpeningRow(row, side)
  }).filter(Boolean) as OpeningTrack[]
  white.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  black.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))

  const band = getTrainingRatingBand(rating)
  if (band === "beginner") {
    const core = [white[0], black.find((row) => row.side === "black-vs-e4"), black.find((row) => row.side === "black-vs-d4")].filter(Boolean) as OpeningTrack[]
    for (const row of black) if (core.length < 3 && !core.some((item) => item.key === row.key)) core.push(row)
    return core
  }
  const limit = band === "intermediate" ? 5 : 8
  return [...white, ...black].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, limit)
}

function normalizedTokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 2))
}

export function getMasterGameOpeningSearch(value: string) {
  const compact = value.trim().toLowerCase().replace(/\s+/g, " ")
  if (/^e4 e5 nf3 nc6 bc4\b/.test(compact)) return "Italian"
  if (/^e4 c6\b/.test(compact)) return "Caro-Kann"
  if (/^e4 c5\b/.test(compact)) return "Sicilian"
  if (/^e4 e6\b/.test(compact)) return "French"
  if (/^d4 d5 c4 e6\b/.test(compact)) return "Queen's Gambit Declined"
  if (/^d4 nf6 c4 g6\b/.test(compact)) return "King's Indian"
  if (/^d4 d5 c4 c6\b/.test(compact)) return "Slav"
  if (/^d4 nf6 c4 e6 nc3 bb4\b/.test(compact)) return "Nimzo-Indian"
  return value.trim()
}

/** Convert the persisted first-move signature into searchable opening-family tokens. */
function openingFamilyTokens(value: string) {
  const tokens = normalizedTokens(value)
  for (const token of normalizedTokens(getMasterGameOpeningSearch(value))) tokens.add(token)
  return tokens
}

export function scoreMasterGameOpeningMatch(
  game: { opening?: string | null; eco?: string | null },
  activeOpenings: readonly (OpeningTrack | string)[],
) {
  const gameText = `${game.opening ?? ""} ${game.eco ?? ""}`.trim()
  if (!gameText) return 0
  const gameTokens = normalizedTokens(gameText)
  let best = 0
  for (const opening of activeOpenings) {
    const key = typeof opening === "string" ? opening : opening.key
    const tokens = openingFamilyTokens(key)
    if (!tokens.size) continue
    const overlap = [...tokens].filter((token) => gameTokens.has(token)).length
    best = Math.max(best, overlap / tokens.size)
  }
  return best
}

export function selectPreferredMasterGame<T extends { id: string | number; opening?: string | null; eco?: string | null }>(
  games: readonly T[],
  activeOpenings: readonly (OpeningTrack | string)[],
) {
  return games.slice().sort((a, b) => {
    const score = scoreMasterGameOpeningMatch(b, activeOpenings) - scoreMasterGameOpeningMatch(a, activeOpenings)
    return score || String(a.id).localeCompare(String(b.id))
  })[0] ?? null
}
