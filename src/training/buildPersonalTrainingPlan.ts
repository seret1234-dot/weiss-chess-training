export type TrainingSectionKey =
 | "boardVision"
 | "openings"
 | "tactics"
 | "endgames"
 | "masterGames"

export type TrainingSection = {
 key: TrainingSectionKey
 label: string
 weight: number
 reason: string
 route: string
 newMasterGameEveryDays?: number
 masteryTargetReviews?: number
 maxMasterGameMoves?: number
}

export type PersonalTrainingPlan = {
 currentRating: number
 ratingSource: string
 targetRating: number | null
 nextMilestone: number | null
 ratingBand: "under1000" | "1000to1600" | "above1600"
 sections: TrainingSection[]
 analysisAvailable: boolean
 analysisMessage: string | null
 validatedEvidenceKey: TrainingSectionKey | null
}

type WeightMap = Record<TrainingSectionKey, number>

type PhaseEvidence = {
 leading: "opening" | "middlegame" | "endgame" | null
 total: number
 leadingShare: number
 leadOverNext: number
 analyzedGames: number
 strong: boolean
}

const sectionKeys: TrainingSectionKey[] = [
 "boardVision",
 "tactics",
 "endgames",
 "openings",
 "masterGames",
]

const minimumWeights: WeightMap = {
 boardVision: 5,
 tactics: 5,
 endgames: 5,
 openings: 5,
 masterGames: 5,
}

const maximumWeights: WeightMap = {
 boardVision: 10,
 tactics: 60,
 endgames: 40,
 openings: 40,
 masterGames: 15,
}

export const NO_ANALYSIS_PLAN_MESSAGE =
 "Game analysis is not available yet. Your starter plan is based on your current rating; connect Chess.com and analyze games to personalize it."

function asNumber(value: unknown): number | null {
 const n = Number(value)
 return Number.isFinite(n) && n > 0 ? n : null
}

function getDetectedRatings(autoProfile: any): Record<string, unknown> {
 if (!autoProfile?.detected_ratings || typeof autoProfile.detected_ratings !== "object") {
  return {}
 }

 return autoProfile.detected_ratings
}

function estimateCurrentRating(autoProfile: any): { rating: number; source: string } {
 const ratings = getDetectedRatings(autoProfile)

 const rapid = asNumber(ratings.rapid)
 if (rapid) return { rating: rapid, source: "rapid" }

 const blitz = asNumber(ratings.blitz)
 if (blitz) return { rating: blitz, source: "blitz" }

 const long = asNumber(ratings.long)
 if (long) return { rating: long, source: "long" }

 const estimated = asNumber(autoProfile?.estimated_rating)
 if (estimated) return { rating: estimated, source: "estimated" }

 return { rating: 800, source: "default" }
}

function ratingBand(rating: number): PersonalTrainingPlan["ratingBand"] {
 if (rating < 1000) return "under1000"
 if (rating < 1600) return "1000to1600"
 return "above1600"
}

function nextMilestone(current: number, target: number | null): number | null {
 if (!target || target <= current) return null

 const milestones = [900, 1000, 1200, 1400, 1600, 1800, 2000, 2200]

 return milestones.find((m) => m > current && m <= target) ?? target
}

function newMasterGameEveryDays(rating: number): number {
 if (rating < 1000) return 60
 if (rating < 1600) return 30
 return 7
}

function getEngineSummary(autoProfile: any) {
 const summary = autoProfile?.engine_analysis_summary
 if (!summary || typeof summary !== "object") return null
 return summary
}

function countFromMap(map: any, key: string): number {
 const value = Number(map?.[key] || 0)
 return Number.isFinite(value) ? value : 0
}

function clampWeight(key: TrainingSectionKey, value: number) {
 return Math.min(maximumWeights[key], Math.max(minimumWeights[key], value))
}

function normalizeWeights(
 weights: WeightMap,
 preferredRemainder: TrainingSectionKey | null,
): WeightMap {
 const normalized = sectionKeys.reduce((next, key) => {
  next[key] = Math.round(clampWeight(key, weights[key]))
  return next
 }, {} as WeightMap)

 let total = sectionKeys.reduce((sum, key) => sum + normalized[key], 0)

 if (total < 100) {
  const addOrder = [
   preferredRemainder ?? "tactics",
   "tactics",
   "endgames",
   "openings",
   "boardVision",
   "masterGames",
  ].filter((key, index, values) => values.indexOf(key) === index) as TrainingSectionKey[]

  for (const key of addOrder) {
   const room = maximumWeights[key] - normalized[key]
   const addition = Math.min(room, 100 - total)
   normalized[key] += addition
   total += addition
   if (total === 100) break
  }
 }

 if (total > 100) {
  const removeOrder: TrainingSectionKey[] = [
   "masterGames",
   "boardVision",
   "openings",
   "endgames",
   "tactics",
  ]

  for (const key of removeOrder) {
   const removable = normalized[key] - minimumWeights[key]
   const removal = Math.min(removable, total - 100)
   normalized[key] -= removal
   total -= removal
   if (total === 100) break
  }
 }

 return normalized
}

function baseWeights(band: PersonalTrainingPlan["ratingBand"]): WeightMap {
 if (band === "under1000") {
  return {
   boardVision: 10,
   tactics: 50,
   endgames: 20,
   openings: 15,
   masterGames: 5,
  }
 }

 if (band === "1000to1600") {
  return {
   boardVision: 8,
   tactics: 40,
   endgames: 22,
   openings: 20,
   masterGames: 10,
  }
 }

 return {
  boardVision: 5,
  tactics: 30,
  endgames: 25,
  openings: 25,
  masterGames: 15,
 }
}

function getAnalyzedGames(autoProfile: any) {
 return countFromMap({ value: autoProfile?.engine_analyzed_games_count }, "value")
}

function phaseEvidence(autoProfile: any, summary: any): PhaseEvidence {
 const opening = countFromMap(summary?.byPhase, "opening")
 const middlegame = countFromMap(summary?.byPhase, "middlegame")
 const endgame = countFromMap(summary?.byPhase, "endgame")
 const total = opening + middlegame + endgame
 const phases = [
  { key: "opening" as const, count: opening },
  { key: "middlegame" as const, count: middlegame },
  { key: "endgame" as const, count: endgame },
 ].sort((a, b) => b.count - a.count)
 const leading = phases[0]
 const second = phases[1]
 const analyzedGames = getAnalyzedGames(autoProfile)
 const leadingShare = total > 0 ? leading.count / total : 0
 const leadOverNext = total > 0 ? (leading.count - second.count) / total : 0

 return {
  leading: total > 0 ? leading.key : null,
  total,
  leadingShare,
  leadOverNext,
  analyzedGames,
  strong:
   analyzedGames >= 12 && total >= 30 && leadingShare >= 0.35,
 }
}

function openingProfileEvidence(autoProfile: any) {
 const profile = autoProfile?.opening_profile
 const rows = [
  ...(Array.isArray(profile?.white) ? profile.white : []),
  ...(Array.isArray(profile?.black) ? profile.black : []),
 ]

 let sampleGames = 0
 let weightedScore = 0

 for (const row of rows) {
  const count = Math.max(0, Number(row?.count) || 0)
  const average = Number(row?.avgScore)
  if (!Number.isFinite(average) || count <= 0) continue
  sampleGames += count
  weightedScore += count * average
 }

 return {
  sampleGames,
  averageScore: sampleGames > 0 ? weightedScore / sampleGames : null,
  weak: sampleGames >= 12 && sampleGames > 0 && weightedScore / sampleGames < 0.45,
 }
}

function transfer(
 weights: WeightMap,
 from: TrainingSectionKey,
 to: TrainingSectionKey,
 amount: number,
) {
 const available = Math.max(0, weights[from] - minimumWeights[from])
 const moved = Math.min(amount, available, maximumWeights[to] - weights[to])
 weights[from] -= moved
 weights[to] += moved
}

function applyEngineAdjustments(
 weights: WeightMap,
 autoProfile: any,
): {
 weights: WeightMap
 preferredRemainder: TrainingSectionKey | null
 analysisAvailable: boolean
 validatedEvidenceKey: TrainingSectionKey | null
} {
 const summary = getEngineSummary(autoProfile)
 if (!summary || Number(summary.mistakes || 0) <= 0) {
  return {
   weights,
   preferredRemainder: null,
   analysisAvailable: false,
   validatedEvidenceKey: null,
  }
 }

 const evidence = phaseEvidence(autoProfile, summary)
 if (!evidence.strong) {
  return {
   weights,
   preferredRemainder: null,
   analysisAvailable: false,
   validatedEvidenceKey: null,
  }
 }

 const adjusted: WeightMap = { ...weights }

 const blunders = countFromMap(summary.bySeverity, "blunder")
 const mistakes = countFromMap(summary.bySeverity, "mistake")
 const serious = blunders + mistakes

 if (evidence.leading === "middlegame") {
  transfer(adjusted, "boardVision", "tactics", 5)
  if (serious >= 20) transfer(adjusted, "openings", "tactics", 5)
  return {
   weights: adjusted,
   preferredRemainder: "tactics",
   analysisAvailable: true,
   validatedEvidenceKey: "tactics",
  }
 }

 if (evidence.leading === "endgame") {
  const stronglyDominant =
   evidence.analyzedGames >= 20 &&
   evidence.total >= 40 &&
   evidence.leadingShare >= 0.65 &&
   evidence.leadOverNext >= 0.2

  if (stronglyDominant) {
   transfer(adjusted, "tactics", "endgames", 15)
   transfer(adjusted, "boardVision", "endgames", 5)
  } else {
   transfer(adjusted, "boardVision", "endgames", 5)
  }

  return {
   weights: adjusted,
   preferredRemainder: "endgames",
   analysisAvailable: true,
   validatedEvidenceKey: "endgames",
  }
 }

 const openingEvidence = openingProfileEvidence(autoProfile)
 const stronglyDominant =
  evidence.analyzedGames >= 20 &&
  evidence.total >= 40 &&
  evidence.leadingShare >= 0.65 &&
  evidence.leadOverNext >= 0.2 &&
  openingEvidence.weak

 if (stronglyDominant) {
  transfer(adjusted, "tactics", "openings", 20)
  transfer(adjusted, "boardVision", "openings", 5)
 } else {
  transfer(adjusted, "boardVision", "openings", 5)
 }

 return {
  weights: adjusted,
  preferredRemainder: "openings",
  analysisAvailable: true,
  validatedEvidenceKey: "openings",
 }
}

function sectionByKey(
 key: TrainingSectionKey,
 weight: number,
 rating: number,
): TrainingSection {
 if (key === "boardVision") {
  return {
   key,
   label: "Board Vision",
   weight,
   reason: "Build board fluency: coordinates, square names, orientation, and fast PGN reading for openings and master games.",
   route: "/board-vision",
  }
 }

 if (key === "tactics") {
  return {
   key,
   label: "Tactics",
   weight,
   reason: "Most improvement comes from mate patterns, forks, pins, skewers, calculation, and avoiding hanging pieces.",
   route: "/tactics",
  }
 }

 if (key === "endgames") {
  return {
   key,
   label: "Endgames",
   weight,
   reason: "King, pawn, rook, and conversion skills prevent many lost points.",
   route: "/endgame-studies",
  }
 }

 if (key === "openings") {
  return {
   key,
   label: "Openings",
   weight,
   reason: "Openings are reinforced from your own games. The goal is playable positions, not heavy theory.",
   route: "/openings",
  }
 }

 return {
  key,
  label: "Master Games",
  weight,
  reason: "",
  route: "/master-games",
  newMasterGameEveryDays: newMasterGameEveryDays(rating),
  masteryTargetReviews: 5,
  maxMasterGameMoves: rating < 1000 ? 30 : undefined,
 }
}

function baseSections(
 band: PersonalTrainingPlan["ratingBand"],
 rating: number,
 autoProfile: any,
): TrainingSection[] {
 const adjustment = applyEngineAdjustments(baseWeights(band), autoProfile)
 const weights = normalizeWeights(adjustment.weights, adjustment.preferredRemainder)

 return [
  sectionByKey("boardVision", weights.boardVision, rating),
  sectionByKey("tactics", weights.tactics, rating),
  sectionByKey("endgames", weights.endgames, rating),
  sectionByKey("openings", weights.openings, rating),
  sectionByKey("masterGames", weights.masterGames, rating),
 ]
}

export function buildPersonalTrainingPlan(autoProfile: any): PersonalTrainingPlan {
 const current = estimateCurrentRating(autoProfile)
 const target = asNumber(autoProfile?.target_rating)
 const band = ratingBand(current.rating)
 const adjustment = applyEngineAdjustments(baseWeights(band), autoProfile)

 return {
  currentRating: current.rating,
  ratingSource: current.source,
  targetRating: target,
  nextMilestone: nextMilestone(current.rating, target),
  ratingBand: band,
  sections: baseSections(band, current.rating, autoProfile),
  analysisAvailable: adjustment.analysisAvailable,
  analysisMessage: adjustment.analysisAvailable ? null : NO_ANALYSIS_PLAN_MESSAGE,
  validatedEvidenceKey: adjustment.validatedEvidenceKey,
 }
}

export function getRecommendedSection(plan: PersonalTrainingPlan): TrainingSection {
 const evidenceOrder: Record<TrainingSectionKey, number> = {
  tactics: 0,
  endgames: 1,
  openings: 2,
  boardVision: 3,
  masterGames: 4,
 }

 const normalSections = plan.sections.filter((section) => section.key !== "masterGames")
 return normalSections.slice().sort((a, b) => {
  if (b.weight !== a.weight) return b.weight - a.weight
  if (plan.validatedEvidenceKey === a.key) return -1
  if (plan.validatedEvidenceKey === b.key) return 1
  return evidenceOrder[a.key] - evidenceOrder[b.key]
 })[0] ?? plan.sections[0]
}
