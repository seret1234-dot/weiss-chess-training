import { CURRICULUM_AREAS, CURRICULUM_CATALOG } from "./curriculumCatalog"
import { getCategoryWeights, getInitialCurrentStage, getInitialDifficultyCeiling } from "./curriculumPlacement"
import type { CurriculumArea, CurriculumState } from "./curriculumTypes"

export type LegacyChunkProgress = {
  trainer_key?: string | null
  chunk_index?: number | null
  is_mastered?: boolean | null
  mastered_puzzles_count?: number | null
}

export type LegacyTrainingProgress = {
  course?: string | null
  theme?: string | null
  item_id?: string | null
  mastery?: number | null
}

export type LegacyCategoryStat = {
  category?: string | null
  category_key?: string | null
  attempts?: number | null
  correct?: number | null
  avg_time_ms?: number | null
}

export type MappedHistoricalEvidence = {
  area: CurriculumArea
  stageOrder: number
  themeKey: string | null
  trainerKey: string
  attempts: number
}

export type CurriculumSeed = {
  state: {
    ratingSnapshot: number
    ratingSource: "estimated" | "detected" | "target" | "default"
    importedWeaknessArea: CurriculumArea | null
    categoryWeights: Record<CurriculumArea, number>
    legacyCategoryStats: Record<string, { attempts: number; correct: number; averageSolveMs: number | null }>
  }
  areas: Array<{ area: CurriculumArea; currentStage: number; difficultyCeiling: number; categoryWeight: number }>
  mappedEvidence: MappedHistoricalEvidence[]
}

function nonNegativeInteger(value: unknown) {
  return Math.max(0, Math.floor(Number(value) || 0))
}

export function normalizeLegacyCategoryStats(rows: LegacyCategoryStat[]) {
  const output: Record<string, { attempts: number; correct: number; averageSolveMs: number | null }> = {}
  for (const row of rows) {
    const category = String(row.category ?? row.category_key ?? "").trim()
    if (!category) continue
    const attempts = nonNegativeInteger(row.attempts)
    const correct = Math.min(attempts, nonNegativeInteger(row.correct))
    const average = Number(row.avg_time_ms)
    output[category] = {
      attempts,
      correct,
      averageSolveMs: Number.isFinite(average) && average >= 0 ? Math.round(average) : null,
    }
  }
  return output
}

function validRating(value: unknown) {
  const rating = Number(value)
  return Number.isFinite(rating) && rating >= 100 && rating <= 4000 ? Math.round(rating) : null
}

export function resolveSeedRating(profile: any) {
  const estimated = validRating(profile?.estimated_rating)
  if (estimated) return { rating: estimated, source: "estimated" as const }

  const detected = profile?.detected_ratings && typeof profile.detected_ratings === "object"
    ? profile.detected_ratings
    : {}
  for (const key of ["rapid", "blitz", "long", "daily"]) {
    const rating = validRating(detected[key])
    if (rating) return { rating, source: "detected" as const }
  }

  const target = validRating(profile?.target_rating)
  if (target) return { rating: target, source: "target" as const }
  return { rating: 600, source: "default" as const }
}

export function importedWeaknessFromProfile(profile: any): CurriculumArea | null {
  const summary = profile?.engine_analysis_summary
  const phase = summary?.byPhase
  if (!phase || typeof phase !== "object") return null
  const choices = [
    ["middlegame", "tactics"],
    ["endgame", "endgame-studies"],
    ["opening", "openings"],
  ] as const
  const ranked = choices
    .map(([phaseKey, area]) => ({ area, count: Math.max(0, Number(phase[phaseKey]) || 0) }))
    .sort((a, b) => b.count - a.count)
  const total = ranked.reduce((sum, entry) => sum + entry.count, 0)
  return total >= 30 && ranked[0].count / total >= 0.35 ? ranked[0].area : null
}

export function mapUnambiguousHistoricalProgress(rows: LegacyChunkProgress[]): MappedHistoricalEvidence[] {
  const seen = new Set<string>()
  const evidence: MappedHistoricalEvidence[] = []
  for (const row of rows) {
    if (!row.trainer_key || row.is_mastered !== true) continue
    const item = CURRICULUM_CATALOG.find((candidate) => candidate.available && candidate.trainerKey === row.trainer_key)
    if (!item) continue
    const key = `${item.area}:${item.stageOrder}:${item.theme ?? ""}:${item.trainerKey}`
    if (seen.has(key)) continue
    seen.add(key)
    evidence.push({
      area: item.area,
      stageOrder: item.stageOrder,
      themeKey: item.theme ?? null,
      trainerKey: item.trainerKey,
      // This is evidence only. It never sets permanent mastery because historical
      // rows do not reliably contain accuracy, hint, or session-day evidence.
      attempts: Math.max(0, Number(row.mastered_puzzles_count) || 0),
    })
  }
  return evidence
}

export function mapUnambiguousTrainingProgress(rows: LegacyTrainingProgress[]): MappedHistoricalEvidence[] {
  const mapped: MappedHistoricalEvidence[] = []
  for (const row of rows) {
    // Only an exact modern trainer key is safe. course/theme strings are reused by
    // several legacy trainers and must never infer a curriculum stage.
    const item = CURRICULUM_CATALOG.find((candidate) => candidate.available && candidate.trainerKey === row.item_id)
    if (!item) continue
    mapped.push({
      area: item.area,
      stageOrder: item.stageOrder,
      themeKey: item.theme ?? null,
      trainerKey: item.trainerKey,
      attempts: Math.max(0, Number(row.mastery) || 0),
    })
  }
  return mapped
}

/** Stage rows have a (user, area, stage) key, so multiple mapped themes must be
 * collapsed before an idempotent upsert. They remain non-mastering evidence. */
export function collapseMappedStageEvidence(evidence: MappedHistoricalEvidence[]) {
  const grouped = new Map<string, Omit<MappedHistoricalEvidence, "themeKey" | "trainerKey">>()
  for (const item of evidence) {
    const key = `${item.area}:${item.stageOrder}`
    const existing = grouped.get(key)
    if (existing) existing.attempts += item.attempts
    else grouped.set(key, { area: item.area, stageOrder: item.stageOrder, attempts: item.attempts })
  }
  return [...grouped.values()]
}

export function buildConservativeCurriculumSeed(
  profile: any,
  chunkRows: LegacyChunkProgress[] = [],
  trainingRows: LegacyTrainingProgress[] = [],
  categoryStats: LegacyCategoryStat[] = [],
): CurriculumSeed {
  const rating = resolveSeedRating(profile)
  const importedWeaknessArea = importedWeaknessFromProfile(profile)
  const state: CurriculumState = { rating: rating.rating, importedWeakness: importedWeaknessArea }
  const categoryWeights = getCategoryWeights(state)
  const areas = CURRICULUM_AREAS.map((area) => {
    if (area === "mates" || area === "tactics") {
      return {
        area,
        currentStage: getInitialCurrentStage(area, rating.rating),
        difficultyCeiling: getInitialDifficultyCeiling(area, rating.rating),
        categoryWeight: categoryWeights[area],
      }
    }
    return {
      area,
      currentStage: 1,
      difficultyCeiling: area === "endgame-piece-mates" ? 2 : 1,
      categoryWeight: categoryWeights[area],
    }
  })

  return {
    state: {
      ratingSnapshot: rating.rating,
      ratingSource: rating.source,
      importedWeaknessArea,
      categoryWeights,
      legacyCategoryStats: normalizeLegacyCategoryStats(categoryStats),
    },
    areas,
    mappedEvidence: [
      ...mapUnambiguousHistoricalProgress(chunkRows),
      ...mapUnambiguousTrainingProgress(trainingRows),
    ],
  }
}
