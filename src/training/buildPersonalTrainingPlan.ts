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
}

type WeightMap = Record<TrainingSectionKey, number>

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

function normalizeWeights(weights: WeightMap): WeightMap {
 const total = Object.values(weights).reduce((sum, value) => sum + value, 0)
 if (total === 100) return weights

 const keys = Object.keys(weights) as TrainingSectionKey[]
 const normalized: WeightMap = {
  boardVision: 0,
  tactics: 0,
  endgames: 0,
  openings: 0,
  masterGames: 0,
 }

 let used = 0

 for (const key of keys) {
  normalized[key] = Math.max(0, Math.round((weights[key] / total) * 100))
  used += normalized[key]
 }

 normalized.tactics += 100 - used

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

function applyEngineAdjustments(weights: WeightMap, autoProfile: any): WeightMap {
 const summary = getEngineSummary(autoProfile)
 if (!summary || Number(summary.mistakes || 0) <= 0) return weights

 const opening = countFromMap(summary.byPhase, "opening")
 const middle = countFromMap(summary.byPhase, "middlegame")
 const endgame = countFromMap(summary.byPhase, "endgame")

 const adjusted: WeightMap = { ...weights }

 if (middle >= opening && middle >= endgame) {
  adjusted.tactics += 5
  adjusted.boardVision -= 5
 }

 if (endgame > middle && endgame >= opening) {
  adjusted.endgames += 5
  adjusted.boardVision -= 5
 }

 if (opening > middle && opening > endgame) {
  adjusted.openings += 5
  adjusted.boardVision -= 5
 }

 const blunders = countFromMap(summary.bySeverity, "blunder")
 const mistakes = countFromMap(summary.bySeverity, "mistake")
 const serious = blunders + mistakes

 if (serious >= 20) {
  adjusted.tactics += 5
  adjusted.openings -= 5
 }

 adjusted.boardVision = Math.max(5, adjusted.boardVision)
 adjusted.openings = Math.max(5, adjusted.openings)
 adjusted.masterGames = Math.max(5, adjusted.masterGames)

 return normalizeWeights(adjusted)
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
 const weights = applyEngineAdjustments(baseWeights(band), autoProfile)

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

 return {
  currentRating: current.rating,
  ratingSource: current.source,
  targetRating: target,
  nextMilestone: nextMilestone(current.rating, target),
  ratingBand: band,
  sections: baseSections(band, current.rating, autoProfile),
 }
}
