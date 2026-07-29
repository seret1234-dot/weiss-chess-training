import type { CurriculumArea, CurriculumState } from "./curriculumTypes"

export type StageDistribution = Array<{ stage: number; weight: number }>

const MATE_DISTRIBUTIONS: Array<{ minRating: number; stages: StageDistribution }> = [
  { minRating: 1800, stages: [{ stage: 1, weight: 10 }, { stage: 2, weight: 10 }, { stage: 3, weight: 50 }, { stage: 4, weight: 30 }] },
  { minRating: 1500, stages: [{ stage: 1, weight: 10 }, { stage: 2, weight: 20 }, { stage: 3, weight: 50 }, { stage: 4, weight: 20 }] },
  { minRating: 1200, stages: [{ stage: 1, weight: 15 }, { stage: 2, weight: 35 }, { stage: 3, weight: 40 }, { stage: 4, weight: 10 }] },
  { minRating: 1000, stages: [{ stage: 1, weight: 25 }, { stage: 2, weight: 65 }, { stage: 3, weight: 10 }] },
  { minRating: 700, stages: [{ stage: 1, weight: 70 }, { stage: 2, weight: 30 }] },
  { minRating: 0, stages: [{ stage: 1, weight: 90 }, { stage: 2, weight: 10 }] },
]

const TACTIC_DISTRIBUTIONS: Array<{ minRating: number; stages: StageDistribution }> = [
  { minRating: 1800, stages: [{ stage: 1, weight: 10 }, { stage: 2, weight: 10 }, { stage: 3, weight: 45 }, { stage: 4, weight: 35 }] },
  { minRating: 1500, stages: [{ stage: 1, weight: 10 }, { stage: 2, weight: 20 }, { stage: 3, weight: 55 }, { stage: 4, weight: 15 }] },
  { minRating: 1200, stages: [{ stage: 1, weight: 15 }, { stage: 2, weight: 45 }, { stage: 3, weight: 35 }, { stage: 4, weight: 5 }] },
  { minRating: 1000, stages: [{ stage: 1, weight: 25 }, { stage: 2, weight: 65 }, { stage: 3, weight: 10 }] },
  { minRating: 700, stages: [{ stage: 1, weight: 75 }, { stage: 2, weight: 25 }] },
  { minRating: 0, stages: [{ stage: 1, weight: 90 }, { stage: 2, weight: 10 }] },
]

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

function distributionFor(rating: number, distributions: Array<{ minRating: number; stages: StageDistribution }>) {
  return distributions.find((entry) => rating >= entry.minRating)?.stages ?? distributions.at(-1)!.stages
}

export function getInitialStageDistribution(area: "mates" | "tactics", rating: number | null | undefined): StageDistribution {
  const safeRating = normalizedRating(rating)
  return distributionFor(safeRating, area === "mates" ? MATE_DISTRIBUTIONS : TACTIC_DISTRIBUTIONS)
}

export function getInitialCurrentStage(area: "mates" | "tactics", rating: number | null | undefined) {
  const distribution = getInitialStageDistribution(area, rating)
  return distribution.reduce((best, entry) => entry.weight > best.weight ? entry : best).stage
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
