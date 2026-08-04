import { supabase } from "../../lib/supabase"
import { getStageThemes } from "./curriculumCatalog"
import {
  aggregateCurriculumEvents,
  isThemeMastered,
  regressionReason,
  stageMasteryFromEvidence,
  validateCurriculumEvent,
  type CurriculumSessionEvidence,
  type TransferOutcome,
} from "./curriculumEvents"
import {
  buildConservativeCurriculumSeed,
  collapseMappedStageEvidence,
  type LegacyCategoryStat,
  type LegacyChunkProgress,
  type LegacyTrainingProgress,
} from "./curriculumSeed"
import type { CurriculumArea, CurriculumState, ThemeMastery } from "./curriculumTypes"

type SupabaseLike = any

const TABLES = {
  state: "user_curriculum_state",
  area: "user_curriculum_area_progress",
  stage: "user_curriculum_stage_progress",
  theme: "user_curriculum_theme_progress",
  session: "user_curriculum_session_evidence",
} as const

function throwIfError(error: any, message: string) {
  if (error) throw new Error(`${message}: ${error.message ?? String(error)}`)
}

function stateFromRows(stateRow: any, areaRows: any[], stageRows: any[], themeRows: any[]): CurriculumState {
  const activeStages: Partial<Record<CurriculumArea, number>> = {}
  const difficultyCeilings: Partial<Record<CurriculumArea, number>> = {}
  const temporaryReinforcement: Partial<Record<CurriculumArea, boolean>> = {}
  const stageMastery: Partial<Record<CurriculumArea, Record<number, any>>> = {}
  const themeMastery: Partial<Record<CurriculumArea, Record<string, ThemeMastery>>> = {}

  for (const row of areaRows) {
    activeStages[row.area as CurriculumArea] = Number(row.current_stage)
    difficultyCeilings[row.area as CurriculumArea] = Number(row.difficulty_ceiling ?? row.current_stage)
    temporaryReinforcement[row.area as CurriculumArea] = Boolean(row.temporary_reinforcement)
  }
  for (const row of stageRows) {
    const area = row.area as CurriculumArea
    stageMastery[area] ??= {}
    stageMastery[area]![Number(row.stage_order)] = {
      attempts: Number(row.recent_attempts ?? row.attempts ?? 0),
      recentAccuracy: Number(row.recent_attempts ?? 0) > 0
        ? Number(row.recent_correct_attempts ?? 0) / Number(row.recent_attempts)
        : 0,
      mixedAccuracy: Number(row.mixed_attempts ?? 0) > 0
        ? Number(row.mixed_correct_attempts ?? 0) / Number(row.mixed_attempts)
        : 0,
      sessionDays: Number(row.session_days ?? 0),
      permanentlyMastered: Boolean(row.permanent_mastery),
    }
  }
  for (const row of themeRows) {
    const area = row.area as CurriculumArea
    themeMastery[area] ??= {}
    themeMastery[area]![String(row.theme_key)] = {
      attempts: Number(row.attempts ?? 0),
      recentAccuracy: Number(row.attempts ?? 0) > 0 ? Number(row.correct_attempts ?? 0) / Number(row.attempts) : 0,
      averageSolveSeconds: Number(row.average_solve_ms ?? 0) / 1000,
      hintRate: Number(row.attempts ?? 0) > 0 ? Number(row.hint_count ?? 0) / Number(row.attempts) : 0,
      mastered: Boolean(row.permanent_mastery),
    }
  }

  return {
    rating: Number(stateRow.rating_snapshot ?? 600),
    activeStages,
    difficultyCeilings,
    stageMastery,
    themeMastery,
    temporaryReinforcement,
    importedWeakness: stateRow.imported_weakness_area as CurriculumArea | null,
  }
}

export async function readCurriculumState(userId: string, client: SupabaseLike = supabase) {
  const [stateResult, areaResult, stageResult, themeResult] = await Promise.all([
    client.from(TABLES.state).select("*").eq("user_id", userId).maybeSingle(),
    client.from(TABLES.area).select("*").eq("user_id", userId),
    client.from(TABLES.stage).select("*").eq("user_id", userId),
    client.from(TABLES.theme).select("*").eq("user_id", userId),
  ])
  throwIfError(stateResult.error, "Could not read curriculum state")
  throwIfError(areaResult.error, "Could not read curriculum area progress")
  throwIfError(stageResult.error, "Could not read curriculum stage progress")
  throwIfError(themeResult.error, "Could not read curriculum theme progress")
  if (!stateResult.data) return null
  return {
    raw: { state: stateResult.data, areas: areaResult.data ?? [], stages: stageResult.data ?? [], themes: themeResult.data ?? [] },
    curriculum: stateFromRows(stateResult.data, areaResult.data ?? [], stageResult.data ?? [], themeResult.data ?? []),
  }
}

async function readLegacyCategoryStats(userId: string, client: SupabaseLike): Promise<LegacyCategoryStat[]> {
  const primary = await client.from("user_category_stats").select("category, attempts, correct, avg_time_ms").eq("user_id", userId)
  if (!primary.error) return primary.data ?? []
  const fallback = await client.from("user_category_stats").select("category_key, attempts, correct, avg_time_ms").eq("user_id", userId)
  throwIfError(fallback.error, "Could not read existing category statistics for curriculum seeding")
  return fallback.data ?? []
}

/**
 * Lazy seed. It only reads legacy rows and writes new curriculum tables. A failed
 * partial seed stays resumable through seeded_from_existing_progress = false.
 */
export async function getOrCreateCurriculumState(userId: string, client: SupabaseLike = supabase) {
  const existing = await readCurriculumState(userId, client)
  if (existing?.raw.state.seeded_from_existing_progress) return existing

  const [profileResult, chunkResult, trainingResult, categoryStats] = await Promise.all([
    client.from("user_auto_profile").select("*").eq("user_id", userId).maybeSingle(),
    client.from("user_chunk_progress").select("trainer_key, chunk_index, is_mastered, mastered_puzzles_count").eq("user_id", userId),
    client.from("training_progress").select("course, theme, item_id, mastery").eq("user_id", userId),
    readLegacyCategoryStats(userId, client),
  ])
  throwIfError(profileResult.error, "Could not read the existing auto profile for curriculum seeding")
  throwIfError(chunkResult.error, "Could not read existing chunk progress for curriculum seeding")
  throwIfError(trainingResult.error, "Could not read existing training progress for curriculum seeding")
  const seed = buildConservativeCurriculumSeed(
    profileResult.data,
    (chunkResult.data ?? []) as LegacyChunkProgress[],
    (trainingResult.data ?? []) as LegacyTrainingProgress[],
    categoryStats,
  )

  const statePayload = {
    user_id: userId,
    curriculum_version: 1,
    rating_snapshot: seed.state.ratingSnapshot,
    rating_source: seed.state.ratingSource,
    imported_weakness_area: seed.state.importedWeaknessArea,
    category_weights: seed.state.categoryWeights,
    legacy_category_stats: seed.state.legacyCategoryStats,
    seeded_from_existing_progress: false,
    source_profile_updated_at: profileResult.data?.updated_at ?? null,
  }
  const { error: stateError } = await client.from(TABLES.state).upsert(statePayload, { onConflict: "user_id" })
  throwIfError(stateError, "Could not create curriculum state")

  const { error: areaError } = await client.from(TABLES.area).upsert(seed.areas.map((area) => ({
    user_id: userId,
    area: area.area,
    current_stage: area.currentStage,
    difficulty_ceiling: area.difficultyCeiling,
    category_weight: area.categoryWeight,
  })), { onConflict: "user_id,area" })
  throwIfError(areaError, "Could not create curriculum area progress")

  // Historical rows remain evidence only; no accuracy/session data means no mastery unlock.
  const mappedStageEvidence = collapseMappedStageEvidence(seed.mappedEvidence)
  if (mappedStageEvidence.length) {
    const { error: stageError } = await client.from(TABLES.stage).upsert(mappedStageEvidence.map((item) => ({
      user_id: userId,
      area: item.area,
      stage_order: item.stageOrder,
      attempts: item.attempts,
      correct_attempts: 0,
      recent_attempts: 0,
      recent_correct_attempts: 0,
      mixed_attempts: 0,
      mixed_correct_attempts: 0,
      session_days: 0,
      permanent_mastery: false,
    })), { onConflict: "user_id,area,stage_order" })
    throwIfError(stageError, "Could not seed mapped curriculum stage evidence")
  }

  const { error: completeError } = await client
    .from(TABLES.state)
    .update({ seeded_from_existing_progress: true })
    .eq("user_id", userId)
  throwIfError(completeError, "Could not finalize curriculum seed")
  return readCurriculumState(userId, client)
}

/** The completed-session count is a stable, read-only ordinal until Phase 3.2
 * begins recording curriculum evidence. It lets the runtime choose the same
 * deterministic recommendation for display and navigation. */
export async function getCurriculumSelectionIndex(userId: string, client: SupabaseLike = supabase) {
  const { count, error } = await client
    .from(TABLES.session)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
  throwIfError(error, "Could not read curriculum session count")
  return Math.max(0, Number(count ?? 0))
}

export async function recordCurriculumSessionEvidence(event: CurriculumSessionEvidence, client: SupabaseLike = supabase) {
  validateCurriculumEvent(event)
  const { data: existing, error: existingError } = await client.from(TABLES.session).select("*")
    .eq("user_id", event.userId).eq("idempotency_key", event.idempotencyKey).maybeSingle()
  throwIfError(existingError, "Could not read existing curriculum session evidence")
  if (existing) return { data: existing, created: false }
  const { data, error } = await client.from(TABLES.session).upsert({
    user_id: event.userId,
    idempotency_key: event.idempotencyKey,
    area: event.area,
    stage_order: event.stageOrder,
    theme_key: event.themeKey ?? null,
    trainer_key: event.trainerKey,
    route: event.route,
    event_kind: event.eventKind,
    attempts: event.attempts,
    correct_attempts: event.correctAttempts,
    hint_count: event.hintCount ?? 0,
    average_solve_ms: event.averageSolveMs ?? null,
    transfer_outcome: event.transferOutcome ?? null,
    occurred_on: event.occurredOn ?? new Date().toISOString().slice(0, 10),
  }, { onConflict: "user_id,idempotency_key" }).select().maybeSingle()
  throwIfError(error, "Could not record curriculum session evidence")
  return { data, created: true }
}

async function loadStageEvents(userId: string, area: CurriculumArea, stageOrder: number, client: SupabaseLike) {
  const { data, error } = await client.from(TABLES.session).select("*")
    .eq("user_id", userId).eq("area", area).eq("stage_order", stageOrder)
  throwIfError(error, "Could not read curriculum session evidence")
  return (data ?? []).map((row: any) => ({
    userId,
    idempotencyKey: row.idempotency_key,
    area,
    stageOrder,
    themeKey: row.theme_key,
    trainerKey: row.trainer_key,
    route: row.route,
    eventKind: row.event_kind,
    attempts: Number(row.attempts),
    correctAttempts: Number(row.correct_attempts),
    hintCount: Number(row.hint_count ?? 0),
    averageSolveMs: row.average_solve_ms == null ? null : Number(row.average_solve_ms),
    transferOutcome: row.transfer_outcome,
    occurredOn: row.occurred_on,
  })) as CurriculumSessionEvidence[]
}

export async function updateThemeAggregate(userId: string, area: "mates" | "tactics", stageOrder: number, themeKey: string, client: SupabaseLike = supabase) {
  const events = (await loadStageEvents(userId, area, stageOrder, client)).filter((event) => event.themeKey === themeKey)
  const aggregate = aggregateCurriculumEvents(events)
  const { data: existing, error: existingError } = await client.from(TABLES.theme).select("permanent_mastery").eq("user_id", userId)
    .eq("area", area).eq("stage_order", stageOrder).eq("theme_key", themeKey).maybeSingle()
  throwIfError(existingError, "Could not read curriculum theme progress")
  const permanentMastery = Boolean(existing?.permanent_mastery) || isThemeMastered(aggregate)
  const { error } = await client.from(TABLES.theme).upsert({
    user_id: userId,
    area,
    stage_order: stageOrder,
    theme_key: themeKey,
    attempts: aggregate.attempts,
    correct_attempts: aggregate.correctAttempts,
    hint_count: aggregate.hintCount,
    average_solve_ms: aggregate.averageSolveMs,
    permanent_mastery: permanentMastery,
    mastered_at: permanentMastery ? new Date().toISOString() : null,
    last_attempt_at: aggregate.lastAttemptAt,
  }, { onConflict: "user_id,area,stage_order,theme_key" })
  throwIfError(error, "Could not update curriculum theme progress")
  return { aggregate, permanentMastery }
}

export async function updateStageAggregate(userId: string, area: CurriculumArea, stageOrder: number, client: SupabaseLike = supabase) {
  const events = await loadStageEvents(userId, area, stageOrder, client)
  const aggregate = aggregateCurriculumEvents(events)
  const { data: current, error: currentError } = await client.from(TABLES.stage).select("permanent_mastery")
    .eq("user_id", userId).eq("area", area).eq("stage_order", stageOrder).maybeSingle()
  throwIfError(currentError, "Could not read curriculum stage progress")

  const { data: themeRows, error: themeError } = await client.from(TABLES.theme).select("*")
    .eq("user_id", userId).eq("area", area).eq("stage_order", stageOrder)
  throwIfError(themeError, "Could not read curriculum themes for stage aggregate")
  const byTheme = new Map((themeRows ?? []).map((row: any) => [String(row.theme_key), row]))
  // A missing required focused theme is deliberately treated as unmastered.
  // Otherwise a partial set of rows could falsely complete a whole stage.
  const requiredThemes = area === "mates" || area === "tactics" ? getStageThemes(area, stageOrder) : []
  const themes: ThemeMastery[] = (requiredThemes.length ? requiredThemes.map((theme) => byTheme.get(theme) ?? {}) : themeRows ?? []).map((row: any) => ({
    mastered: Boolean(row.permanent_mastery),
    recentAccuracy: Number(row.attempts ?? 0) > 0 ? Number(row.correct_attempts ?? 0) / Number(row.attempts) : 0,
    averageSolveSeconds: Number(row.average_solve_ms ?? 0) / 1000,
    hintRate: Number(row.attempts ?? 0) > 0 ? Number(row.hint_count ?? 0) / Number(row.attempts) : 0,
  }))
  const permanentMastery = stageMasteryFromEvidence(aggregate, themes, Boolean(current?.permanent_mastery))
  const { error } = await client.from(TABLES.stage).upsert({
    user_id: userId,
    area,
    stage_order: stageOrder,
    attempts: aggregate.attempts,
    correct_attempts: aggregate.correctAttempts,
    hint_count: aggregate.hintCount,
    average_solve_ms: aggregate.averageSolveMs,
    recent_attempts: aggregate.attempts,
    recent_correct_attempts: aggregate.correctAttempts,
    mixed_attempts: aggregate.mixedAttempts,
    mixed_correct_attempts: aggregate.mixedCorrectAttempts,
    session_days: aggregate.sessionDays,
    permanent_mastery: permanentMastery,
    mastered_at: permanentMastery ? new Date().toISOString() : null,
    last_attempt_at: aggregate.lastAttemptAt,
  }, { onConflict: "user_id,area,stage_order" })
  throwIfError(error, "Could not update curriculum stage progress")
  return { aggregate, permanentMastery }
}

/** Advances only one completed current stage and never beyond the persisted ceiling. */
export async function updateAreaProgressAfterStage(
  userId: string,
  area: CurriculumArea,
  completedStage: number,
  stageMastered: boolean,
  client: SupabaseLike = supabase,
) {
  const current = await readCurriculumState(userId, client)
  if (!current) throw new Error("Curriculum state does not exist.")
  const areaRow = current.raw.areas.find((row: any) => row.area === area)
  if (!areaRow) return { advanced: false, currentStage: 1 }
  const currentStage = Number(areaRow.current_stage ?? 1)
  const ceiling = Number(areaRow.difficulty_ceiling ?? currentStage)
  const nextStage = stageMastered && completedStage === currentStage && currentStage < ceiling
    ? currentStage + 1
    : currentStage
  if (nextStage !== currentStage) {
    const { error } = await client.from(TABLES.area).update({ current_stage: nextStage }).eq("user_id", userId).eq("area", area)
    throwIfError(error, "Could not advance curriculum area stage")
  }
  return { advanced: nextStage !== currentStage, currentStage: nextStage }
}

export async function updateTemporaryReinforcement(userId: string, area: CurriculumArea, client: SupabaseLike = supabase) {
  const current = await readCurriculumState(userId, client)
  if (!current) throw new Error("Curriculum state does not exist.")
  const stage = current.curriculum.activeStages?.[area] ?? 1
  const events = await loadStageEvents(userId, area, stage, client)
  const aggregate = aggregateCurriculumEvents(events)
  const themes = Object.values(current.curriculum.themeMastery?.[area] ?? {})
  const failedTransferTest = events.some((event) => event.eventKind === "transfer" && event.transferOutcome === "failed")
  const reason = regressionReason(area, aggregate, { ...current.curriculum, failedTransferTest }, themes)
  const active = Boolean(reason)
  const { error } = await client.from(TABLES.area).upsert({
    user_id: userId,
    area,
    current_stage: stage,
    difficulty_ceiling: Math.max(stage, current.raw.areas.find((row: any) => row.area === area)?.difficulty_ceiling ?? stage),
    category_weight: current.raw.areas.find((row: any) => row.area === area)?.category_weight ?? 0,
    temporary_reinforcement: active,
    reinforcement_reason: reason,
    reinforcement_until: active ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
  }, { onConflict: "user_id,area" })
  throwIfError(error, "Could not update curriculum reinforcement")
  return { active, reason }
}

/**
 * Best-effort hydration repair. It reads only durable evidence, then upserts
 * derived aggregates; local browser state is never used as an input.
 */
export async function reconcileCurriculumState(userId: string, client: SupabaseLike = supabase) {
  const { data, error } = await client.from(TABLES.session).select("area, stage_order, theme_key")
    .eq("user_id", userId)
  throwIfError(error, "Could not read curriculum evidence for reconciliation")
  const events = data ?? []
  const stageKeys = [...new Set(events.map((row: any) => `${row.area}:${row.stage_order}`))]
  const themeKeys = [...new Set(events.filter((row: any) => row.theme_key).map((row: any) => `${row.area}:${row.stage_order}:${row.theme_key}`))]
  for (const key of themeKeys) {
    const [area, stageOrder, themeKey] = key.split(":")
    await updateThemeAggregate(userId, area as "mates" | "tactics", Number(stageOrder), themeKey, client)
  }
  const areas = new Set<CurriculumArea>()
  for (const key of stageKeys.sort((a, b) => Number(a.split(":")[1]) - Number(b.split(":")[1]))) {
    const [area, stageOrder] = key.split(":")
    const stage = await updateStageAggregate(userId, area as CurriculumArea, Number(stageOrder), client)
    await updateAreaProgressAfterStage(userId, area as CurriculumArea, Number(stageOrder), stage.permanentMastery, client)
    areas.add(area as CurriculumArea)
  }
  for (const area of areas) await updateTemporaryReinforcement(userId, area, client)
  return readCurriculumState(userId, client)
}

export async function recordTransferTestOutcome(userId: string, area: CurriculumArea, stageOrder: number, outcome: TransferOutcome, idempotencyKey: string, client: SupabaseLike = supabase) {
  await recordCurriculumSessionEvidence({
    userId,
    idempotencyKey,
    area,
    stageOrder,
    trainerKey: "weekly-transfer-test",
    route: "/play-computer",
    eventKind: "transfer",
    attempts: 1,
    correctAttempts: outcome === "passed" ? 1 : 0,
    transferOutcome: outcome,
  }, client)
  const { error } = await client.from(TABLES.area).update({
    last_transfer_outcome: outcome,
    last_transfer_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("area", area)
  throwIfError(error, "Could not record curriculum transfer outcome")
  return updateTemporaryReinforcement(userId, area, client)
}
