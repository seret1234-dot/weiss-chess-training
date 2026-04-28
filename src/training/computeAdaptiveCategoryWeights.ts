export type CategoryStatsRow = {
  category_key: string
  attempts: number | null
  correct: number | null
  avg_time_ms: number | null
}

export type AdaptiveWeightConfig = {
  /**
   * Minimum attempts before we trust the stats enough to apply full weighting.
   * Below this, the score is blended back toward neutral.
   */
  minAttemptsForConfidence: number

  /**
   * Accuracy target. Categories below this get boosted.
   * Example: 0.85 means 85% target accuracy.
   */
  targetAccuracy: number

  /**
   * Speed target in milliseconds. Categories slower than this get boosted.
   * Example: 12000 means 12 seconds target average solve time.
   */
  targetAvgTimeMs: number

  /**
   * How much accuracy weakness contributes.
   */
  accuracyImpact: number

  /**
   * How much speed weakness contributes.
   */
  speedImpact: number

  /**
   * Clamp final multiplier into a safe range so Auto mode stays stable.
   */
  minWeight: number
  maxWeight: number
}

export type AdaptiveCategoryWeight = {
  categoryKey: string
  attempts: number
  correct: number
  accuracy: number
  avgTimeMs: number | null
  confidence: number
  accuracyFactor: number
  speedFactor: number
  multiplier: number
}

export type AdaptiveCategoryWeightsResult = {
  byCategory: Record<string, number>
  details: Record<string, AdaptiveCategoryWeight>
}

export const DEFAULT_ADAPTIVE_WEIGHT_CONFIG: AdaptiveWeightConfig = {
  minAttemptsForConfidence: 20,
  targetAccuracy: 0.85,
  targetAvgTimeMs: 12000,
  accuracyImpact: 0.7,
  speedImpact: 0.3,
  minWeight: 0.75,
  maxWeight: 1.75,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function safeNumber(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback
}

/**
 * Converts a weakness ratio into a bounded multiplier contribution.
 *
 * ratio examples:
 * - 1.0 => on target => neutral
 * - 1.2 => weaker/slower than target => boost
 * - 0.8 => stronger/faster than target => reduce
 *
 * impact controls how strong the movement is around neutral 1.0.
 */
function ratioToFactor(ratio: number, impact: number): number {
  const centered = ratio - 1
  return 1 + centered * impact
}

/**
 * Confidence blends low-sample categories back toward neutral 1.0.
 * Example:
 * - 0 attempts => 0 confidence
 * - minAttemptsForConfidence attempts => 1 confidence
 */
function computeConfidence(attempts: number, minAttemptsForConfidence: number): number {
  if (minAttemptsForConfidence <= 0) return 1
  return clamp(attempts / minAttemptsForConfidence, 0, 1)
}

/**
 * Accuracy weakness ratio:
 * - below target => >1 => category gets boosted
 * - above target => <1 => category gets slightly reduced
 */
function computeAccuracyRatio(accuracy: number, targetAccuracy: number): number {
  const safeAccuracy = clamp(accuracy, 0.01, 0.99)
  const safeTarget = clamp(targetAccuracy, 0.01, 0.99)
  return safeTarget / safeAccuracy
}

/**
 * Speed weakness ratio:
 * - slower than target => >1 => boost
 * - faster than target => <1 => reduce
 */
function computeSpeedRatio(avgTimeMs: number | null, targetAvgTimeMs: number): number {
  if (!avgTimeMs || avgTimeMs <= 0) return 1
  const safeTarget = Math.max(targetAvgTimeMs, 1)
  return avgTimeMs / safeTarget
}

/**
 * Produces a stable multiplier per category.
 *
 * Intended use:
 * - due logic remains first
 * - active logic remains second
 * - only when picking among eligible categories/trainers,
 *   multiply their base plan weight by this adaptive multiplier
 */
export function computeAdaptiveCategoryWeights(
  statsRows: CategoryStatsRow[],
  config: Partial<AdaptiveWeightConfig> = {},
): AdaptiveCategoryWeightsResult {
  const finalConfig: AdaptiveWeightConfig = {
    ...DEFAULT_ADAPTIVE_WEIGHT_CONFIG,
    ...config,
  }

  const byCategory: Record<string, number> = {}
  const details: Record<string, AdaptiveCategoryWeight> = {}

  for (const row of statsRows) {
    const categoryKey = row.category_key
    if (!categoryKey) continue

    const attempts = Math.max(0, Math.floor(safeNumber(row.attempts, 0)))
    const correct = Math.max(0, Math.floor(safeNumber(row.correct, 0)))

    const rawAccuracy =
      attempts > 0
        ? clamp(correct / attempts, 0, 1)
        : finalConfig.targetAccuracy

    const avgTimeMs =
      row.avg_time_ms != null && Number.isFinite(row.avg_time_ms)
        ? Math.max(0, Number(row.avg_time_ms))
        : null

    const confidence = computeConfidence(
      attempts,
      finalConfig.minAttemptsForConfidence,
    )

    const accuracyRatio = computeAccuracyRatio(
      rawAccuracy,
      finalConfig.targetAccuracy,
    )

    const speedRatio = computeSpeedRatio(
      avgTimeMs,
      finalConfig.targetAvgTimeMs,
    )

    const rawAccuracyFactor = ratioToFactor(
      accuracyRatio,
      finalConfig.accuracyImpact,
    )

    const rawSpeedFactor = ratioToFactor(
      speedRatio,
      finalConfig.speedImpact,
    )

    /**
     * Blend each factor back toward neutral when confidence is low.
     * This prevents tiny sample sizes from swinging Auto mode too hard.
     */
    const accuracyFactor = 1 + (rawAccuracyFactor - 1) * confidence
    const speedFactor = 1 + (rawSpeedFactor - 1) * confidence

    const combined = accuracyFactor * speedFactor
    const multiplier = clamp(
      combined,
      finalConfig.minWeight,
      finalConfig.maxWeight,
    )

    byCategory[categoryKey] = multiplier
    details[categoryKey] = {
      categoryKey,
      attempts,
      correct,
      accuracy: rawAccuracy,
      avgTimeMs,
      confidence,
      accuracyFactor,
      speedFactor,
      multiplier,
    }
  }

  return {
    byCategory,
    details,
  }
}