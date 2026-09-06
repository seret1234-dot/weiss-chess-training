import type { CurriculumArea, CurriculumState } from "./curriculumTypes"
import { CALCULATION_DEPTH_DISTRIBUTIONS, getTrainingRatingBand } from "../learningPlanRules"

export type StageDistribution = Array<{ stage: number; weight: number }>

export const DEFAULT_BEGINNER_CATEGORY_WEIGHTS: Record<CurriculumArea, number> = {
  mates: 20,
  tactics: 30,
  "endgame-piece-mates": 15,
  "endgame-studies": 2,
  openings: 10,
  "master-games": 5,
  "board-vision": 18,
}

export function normalizedRating(rating: number | null | undefined) {
  return Math.max(0, Math.round(rating ?? 600))
}

export function getInitialStageDistribution(area: "mates" | "tactics", rating: number | null | undefined): StageDistribution {
  const safeRating = normalizedRating(rating)
  const distribution = CALCULATION_DEPTH_DISTRIBUTIONS[getTrainingRatingBand(safeRating)]
  return ([1, 2, 3, 4] as const)
    .map((stage) => ({ stage, weight: distribution[stage] }))
    .filter((entry) => entry.weight > 0)
}

export function getInitialCurrentStage(area: "mates" | "tactics", rating: number | null | undefined) {
  const distribution = getInitialStageDistribution(area, rating)
  return distribution.reduce((best, entry) => entry.weight >= best.weight ? entry : best).stage
}

export function getInitialDifficultyCeiling(area: "mates" | "tactics", rating: number | null | undefined) {
  return Math.max(...getInitialStageDistribution(area, rating).map((entry) => entry.stage))
}

/**
 * Category allocation is intentionally independent from item eligibility. Imported
 * analysis can raise a category's share, but cannot widen a stage ceiling.
 */
export function getCategoryWeights(state: CurriculumState): Record<CurriculumArea, number> {
  const weights = { ...DEFAULT_BEGINNER_CATEGORY_WEIGHTS }
  const weakness = state.importedWeakness
  if (!weakness) return weights

  const donorOrder: CurriculumArea[] = ["master-games", "openings", "board-vision", "endgame-studies", "mates", "endgame-piece-mates", "tactics"]
  let transferRemaining = 10
  for (const donor of donorOrder) {
    if (donor === weakness || transferRemaining <= 0) continue
    const transferable = Math.min(transferRemaining, Math.max(0, weights[donor] - 5))
    weights[donor] -= transferable
    weights[weakness] += transferable
    transferRemaining -= transferable
  }
  return weights
}
