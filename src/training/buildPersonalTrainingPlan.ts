import {
  assessGoalFeasibility,
  readTrainingGoals,
  resolveTrainingCurrentRating,
  type GoalFeasibility,
} from "./trainingGoals"
import {
  buildActiveOpeningTracks,
  getBoardVisionPlacement,
  getMasterGameCadenceDays,
  getTrainingRatingBand,
  selectCalculationDepth,
  selectWeightedPriorityKey,
  type OpeningTrack,
} from "./learningPlanRules"

export type TrainingSectionKey =
  | "boardVision"
  | "openings"
  | "tactics"
  | "masterTactics"
  | "endgames"
  | "masterMates"
  | "masterGames"

export const PERMANENT_TRAINING_SECTION_ORDER: readonly TrainingSectionKey[] = Object.freeze([
  "boardVision", "openings", "tactics", "masterTactics", "endgames", "masterMates", "masterGames",
])

export type TrainingSection = {
  key: TrainingSectionKey
  label: string
  weight: number
  reason: string
  route: string
  eligible?: boolean
  detectedOpenings?: string[]
  preferredOpeningKeys?: string[]
  placementLevel?: string
  doneThisSession?: boolean
  mastered?: boolean
  nextNewGameEligibleAt?: string | null
  newMasterGameEveryDays?: number
  masteryTargetReviews?: number
  maxMasterGameMoves?: number
}

export type PersonalTrainingPlan = {
  currentRating: number
  ratingSource: string
  targetRating: number | null
  nextMilestone: number | null
  dailyPracticeMinutes: number
  effectiveDailyPracticeMinutes: number
  timeframeMonths: number | null
  goalFeasibility: GoalFeasibility | null
  ratingBand: "under1000" | "1000to1600" | "above1600"
  calculationDepth: 1 | 2 | 3 | 4
  activeOpeningTracks: OpeningTrack[]
  sections: TrainingSection[]
  analysisAvailable: boolean
  analysisMessage: string | null
  validatedEvidenceKey: TrainingSectionKey | null
}

type WeightMap = Record<TrainingSectionKey, number>

const minimumWeights: WeightMap = {
  boardVision: 3, openings: 5, tactics: 8, masterTactics: 5, endgames: 5, masterMates: 5, masterGames: 3,
}
const maximumWeights: WeightMap = {
  boardVision: 10, openings: 35, tactics: 45, masterTactics: 35, endgames: 35, masterMates: 30, masterGames: 15,
}

export const NO_ANALYSIS_PLAN_MESSAGE =
  "Game analysis is not available yet. Your starter plan is based on your current rating; connect Chess.com and analyze games to personalize it."

function legacyBand(rating: number): PersonalTrainingPlan["ratingBand"] {
  const band = getTrainingRatingBand(rating)
  return band === "beginner" ? "under1000" : band === "intermediate" ? "1000to1600" : "above1600"
}

function nextMilestone(current: number, target: number | null, saved: number | null, suggested: number | null) {
  if (!target || target <= current) return null
  if (saved && saved > current && saved <= target) return saved
  if (suggested && suggested > current && suggested <= target) return suggested
  return [900, 1000, 1200, 1400, 1600, 1800, 2000, 2200].find((value) => value > current && value <= target) ?? target
}

function baseWeights(rating: number): WeightMap {
  const band = getTrainingRatingBand(rating)
  if (band === "beginner") return { boardVision: 8, openings: 13, tactics: 32, masterTactics: 18, endgames: 13, masterMates: 11, masterGames: 5 }
  if (band === "intermediate") return { boardVision: 6, openings: 16, tactics: 25, masterTactics: 20, endgames: 15, masterMates: 10, masterGames: 8 }
  return { boardVision: 4, openings: 17, tactics: 20, masterTactics: 22, endgames: 17, masterMates: 10, masterGames: 10 }
}

function count(map: any, key: string) {
  const value = Number(map?.[key] ?? 0)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function transfer(weights: WeightMap, from: TrainingSectionKey, to: TrainingSectionKey, requested: number) {
  const amount = Math.min(requested, weights[from] - minimumWeights[from], maximumWeights[to] - weights[to])
  if (amount <= 0) return
  weights[from] -= amount
  weights[to] += amount
}

function normalized(weights: WeightMap, preferred: TrainingSectionKey | null) {
  const next = { ...weights }
  for (const key of PERMANENT_TRAINING_SECTION_ORDER) next[key] = Math.max(minimumWeights[key], Math.min(maximumWeights[key], Math.round(next[key])))
  let total = PERMANENT_TRAINING_SECTION_ORDER.reduce((sum, key) => sum + next[key], 0)
  const addOrder = [preferred, "tactics", "masterTactics", "endgames", "openings", "masterMates", "masterGames", "boardVision"].filter(Boolean) as TrainingSectionKey[]
  while (total < 100) {
    const key = addOrder.find((candidate) => next[candidate] < maximumWeights[candidate])
    if (!key) break
    next[key] += 1
    total += 1
  }
  const removeOrder: TrainingSectionKey[] = ["masterGames", "boardVision", "openings", "endgames", "masterMates", "masterTactics", "tactics"]
  while (total > 100) {
    const key = removeOrder.find((candidate) => next[candidate] > minimumWeights[candidate])
    if (!key) break
    next[key] -= 1
    total -= 1
  }
  return next
}

function analyze(profile: any, initial: WeightMap) {
  const summary = profile?.engine_analysis_summary
  const analyzedGames = Number(profile?.engine_analyzed_games_count ?? summary?.analyzedGames ?? 0)
  const opening = count(summary?.byPhase, "opening")
  const middle = count(summary?.byPhase, "middlegame")
  const endgame = count(summary?.byPhase, "endgame")
  const total = opening + middle + endgame
  if (!summary || analyzedGames < 12 || total < 30) return { weights: normalized(initial, null), available: false, preferred: null as TrainingSectionKey | null }
  const ranked = [
    { phase: "opening", value: opening }, { phase: "middlegame", value: middle }, { phase: "endgame", value: endgame },
  ].sort((a, b) => b.value - a.value)
  if (ranked[0].value / total < 0.35) return { weights: normalized(initial, null), available: false, preferred: null as TrainingSectionKey | null }
  const weights = { ...initial }
  let preferred: TrainingSectionKey
  if (ranked[0].phase === "opening") {
    preferred = "openings"
    transfer(weights, "tactics", "openings", 10)
    transfer(weights, "masterGames", "openings", 2)
  } else if (ranked[0].phase === "endgame") {
    preferred = "endgames"
    transfer(weights, "openings", "endgames", 6)
    transfer(weights, "tactics", "endgames", 10)
    transfer(weights, "masterTactics", "endgames", 3)
  } else {
    preferred = "tactics"
    transfer(weights, "openings", "tactics", 4)
    transfer(weights, "endgames", "masterTactics", 3)
  }
  const motifs = summary?.byMotif ?? summary?.byTheme ?? {}
  const missedMates = count(motifs, "mate") + count(motifs, "missedMate") + count(motifs, "checkmate")
  if (missedMates > 0) transfer(weights, "tactics", "masterMates", Math.min(5, missedMates))
  return { weights: normalized(weights, preferred), available: true, preferred }
}

function masterGameEligibility(profile: any, rating: number) {
  const cadenceDays = getMasterGameCadenceDays(rating)
  const raw = profile?.master_game_last_introduced_at ?? profile?.last_new_master_game_at ?? null
  const last = raw ? new Date(String(raw)) : null
  if (!last || !Number.isFinite(last.getTime())) return { cadenceDays, eligible: true, nextAt: null }
  const next = new Date(last)
  next.setDate(next.getDate() + cadenceDays)
  return { cadenceDays, eligible: next.getTime() <= Date.now(), nextAt: next.toISOString() }
}

function makeSections(profile: any, rating: number, weights: WeightMap, openings: OpeningTrack[]): TrainingSection[] {
  const placement = getBoardVisionPlacement(rating, profile?.board_vision_demonstrated_checkpoint)
  const masterGame = masterGameEligibility(profile, rating)
  return [
    { key: "boardVision", label: "Board Vision", weight: weights.boardVision, route: `/board-vision?placement=${placement.level}`, placementLevel: placement.level, doneThisSession: false, mastered: placement.checkpoint >= 7 && Boolean(profile?.board_vision_mastered), reason: "A slow foundation track placed by rating, then adjusted only by Board Vision performance; at most one chunk per Auto session." },
    { key: "openings", label: "Openings", weight: weights.openings, route: "/openings", detectedOpenings: openings.map((row) => row.key), reason: openings.length ? "Deepen the openings found most often in your imported games before adding unrelated breadth." : "Build a narrow core repertoire; imported games will replace generic priorities with the lines you actually play." },
    { key: "tactics", label: "Tactics", weight: weights.tactics, route: "/tactics", reason: "Broad practical calculation, mixed application, and recurring mistakes from games and trainers." },
    { key: "masterTactics", label: "Master Tactics", weight: weights.masterTactics, route: "/master-tactics", eligible: true, reason: "Deliberate motif recognition remains separate from broad Tactics." },
    { key: "endgames", label: "Endgames", weight: weights.endgames, route: "/endgame-studies", reason: "Technical positions, conversion, and recurring late-game mistakes." },
    { key: "masterMates", label: "Master Mates", weight: weights.masterMates, route: "/master-mates", eligible: true, reason: "Deliberate real-game mating-pattern mastery remains a separate course." },
    { key: "masterGames", label: "Master Games", weight: weights.masterGames, route: "/master-games", eligible: masterGame.eligible, preferredOpeningKeys: openings.map((row) => row.key), nextNewGameEligibleAt: masterGame.nextAt, newMasterGameEveryDays: masterGame.cadenceDays, masteryTargetReviews: 5, maxMasterGameMoves: rating < 1000 ? 30 : undefined, reason: openings.length ? "Prefer model games matching your active opening tracks; new-game cadence is independent of due reviews." : "Model-game reviews continue normally; new games follow the locked rating cadence." },
  ]
}

export function buildPersonalTrainingPlan(autoProfile: any): PersonalTrainingPlan {
  const goals = readTrainingGoals(autoProfile)
  const current = resolveTrainingCurrentRating(autoProfile)
  const feasibility = goals.targetRating ? assessGoalFeasibility({ currentRating: current.rating, targetRating: goals.targetRating, dailyMinutes: goals.dailyMinutes, timeframeMonths: goals.timeframeMonths }) : null
  const analysis = analyze(autoProfile, baseWeights(current.rating))
  const activeOpeningTracks = buildActiveOpeningTracks(autoProfile?.opening_profile, current.rating)
  return {
    currentRating: current.rating,
    ratingSource: current.source,
    targetRating: goals.targetRating,
    nextMilestone: nextMilestone(current.rating, goals.targetRating, goals.currentMilestoneRating, feasibility?.recommendedMilestone ?? null),
    dailyPracticeMinutes: goals.dailyMinutes,
    effectiveDailyPracticeMinutes: goals.dailyMinutes * 0.65,
    timeframeMonths: goals.timeframeMonths,
    goalFeasibility: feasibility,
    ratingBand: legacyBand(current.rating),
    calculationDepth: selectCalculationDepth(current.rating, Number(autoProfile?.completed_training_selections ?? 0)),
    activeOpeningTracks,
    sections: makeSections(autoProfile, current.rating, analysis.weights, activeOpeningTracks),
    analysisAvailable: analysis.available,
    analysisMessage: analysis.available ? null : NO_ANALYSIS_PLAN_MESSAGE,
    validatedEvidenceKey: analysis.preferred,
  }
}

export function getRecommendedSection(plan: PersonalTrainingPlan): TrainingSection {
  const order = new Map(PERMANENT_TRAINING_SECTION_ORDER.map((key, index) => [key, index]))
  const eligible = plan.sections.filter((section) => section.eligible !== false && section.key !== "masterGames")
  return eligible.slice().sort((a, b) => b.weight - a.weight || (order.get(a.key)! - order.get(b.key)!))[0] ?? plan.sections[0]
}

export function selectScheduledSection(
  plan: PersonalTrainingPlan,
  completedSelections: number,
  excluded: readonly TrainingSectionKey[] = [],
) {
  const weights = Object.fromEntries(plan.sections.map((section) => [section.key, section.weight])) as Record<TrainingSectionKey, number>
  const unavailable = plan.sections.filter((section) => section.eligible === false).map((section) => section.key)
  const key = selectWeightedPriorityKey(PERMANENT_TRAINING_SECTION_ORDER, weights, completedSelections, [...excluded, ...unavailable])
  return plan.sections.find((section) => section.key === key) ?? getRecommendedSection(plan)
}
