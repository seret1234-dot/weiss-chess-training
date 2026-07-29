import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
  const seed = await vite.ssrLoadModule("/src/training/curriculum/curriculumSeed.ts")
  const events = await vite.ssrLoadModule("/src/training/curriculum/curriculumEvents.ts")
  await vite.ssrLoadModule("/src/training/curriculum/curriculumPersistence.ts")
  const selector = await vite.ssrLoadModule("/src/training/curriculum/selectCurriculumItem.ts")
  const migration = await readFile(new URL("../supabase/migrations/20260729_add_curriculum_progress.sql", import.meta.url), "utf8")
  const scheduler = await readFile(new URL("../src/training/getNextDueItem.ts", import.meta.url), "utf8")

  const profile = Object.freeze({
    estimated_rating: 620,
    target_rating: 1800,
    detected_ratings: { rapid: 900 },
    engine_analysis_summary: { byPhase: { opening: 2, middlegame: 45, endgame: 3 } },
  })
  const legacyRows = Object.freeze([
    { trainer_key: "anastasia-mate-1", is_mastered: true, mastered_puzzles_count: 12 },
    { trainer_key: "unknown-legacy-trainer", is_mastered: true, mastered_puzzles_count: 999 },
  ])

  const seedOne = seed.buildConservativeCurriculumSeed(profile, legacyRows)
  const seedTwo = seed.buildConservativeCurriculumSeed(profile, legacyRows)
  assert.deepEqual(seedOne, seedTwo, "repeating the same seed produces identical curriculum rows")
  assert.equal(seedOne.state.ratingSnapshot, 620, "valid estimated rating has priority")
  assert.equal(seedOne.state.ratingSource, "estimated")
  assert.equal(seedOne.state.importedWeaknessArea, "tactics")
  assert.equal(seedOne.mappedEvidence.length, 1, "ambiguous historical progress cannot grant curriculum evidence")
  assert.equal(seedOne.mappedEvidence[0].trainerKey, "anastasia-mate-1", "clearly mapped history contributes only mapped evidence")
  assert.equal(seedOne.mappedEvidence[0].attempts, 12)
  assert.deepEqual(seedOne.state.legacyCategoryStats, {}, "missing legacy category data remains harmless context")
  assert.deepEqual(profile, {
    estimated_rating: 620, target_rating: 1800, detected_ratings: { rapid: 900 },
    engine_analysis_summary: { byPhase: { opening: 2, middlegame: 45, endgame: 3 } },
  }, "seeding never mutates the existing profile")
  assert.deepEqual(legacyRows, [
    { trainer_key: "anastasia-mate-1", is_mastered: true, mastered_puzzles_count: 12 },
    { trainer_key: "unknown-legacy-trainer", is_mastered: true, mastered_puzzles_count: 999 },
  ], "seeding never mutates existing progress rows")
  assert.equal(seedOne.areas.find((row) => row.area === "tactics").difficultyCeiling, 2, "imported tactical weakness cannot raise a beginner tactic ceiling")
  assert.deepEqual(seed.collapseMappedStageEvidence([
    ...seedOne.mappedEvidence,
    { ...seedOne.mappedEvidence[0], trainerKey: "back-rank-mate-1", attempts: 5 },
  ]), [{ area: "mates", stageOrder: 1, attempts: 17 }], "mapped evidence collapses safely for stage upsert keys")
  const seededFromAllSources = seed.buildConservativeCurriculumSeed(profile, legacyRows, [
    { item_id: "back-rank-mate-1", mastery: 7 },
    { course: "mates", theme: "ambiguous-legacy-theme", item_id: "unknown", mastery: 99 },
  ], [{ category: "tactics", attempts: 40, correct: 28, avg_time_ms: 1234 }])
  assert.equal(seededFromAllSources.mappedEvidence.length, 2, "only exact training-progress trainer keys add evidence")
  assert.deepEqual(seededFromAllSources.state.legacyCategoryStats.tactics, { attempts: 40, correct: 28, averageSolveMs: 1234 }, "legacy category statistics seed context without a stage unlock")

  const focused = (day, correct = 8, hints = 0, solveMs = 30_000) => ({
    userId: "user-a", idempotencyKey: `event-${day}-${correct}-${hints}-${solveMs}`, area: "tactics", stageOrder: 1,
    themeKey: "hanging-piece", trainerKey: "tactic-hanging-piece-m1", route: "/tactics/m1/hanging-piece",
    eventKind: "focused", attempts: 10, correctAttempts: correct, hintCount: hints, averageSolveMs: solveMs, occurredOn: day,
  })
  const themeBoundary = events.aggregateCurriculumEvents([
    focused("2026-07-01"), focused("2026-07-02"), focused("2026-07-03", 8),
  ])
  assert.equal(events.isThemeMastered(themeBoundary), true, "theme mastery unlocks exactly at 80% across 30 attempts")
  assert.equal(events.isThemeMastered({ ...themeBoundary, correctAttempts: 23 }), false, "theme mastery remains locked below 80%")

  const mixedEvents = [
    { ...focused("2026-07-01"), idempotencyKey: "mixed-1", eventKind: "mixed", attempts: 10, correctAttempts: 8 },
    { ...focused("2026-07-02"), idempotencyKey: "mixed-2", eventKind: "mixed", attempts: 10, correctAttempts: 8 },
    { ...focused("2026-07-03"), idempotencyKey: "mixed-3", eventKind: "mixed", attempts: 10, correctAttempts: 8 },
  ]
  const mixedAggregate = events.aggregateCurriculumEvents(mixedEvents)
  assert.equal(mixedAggregate.sessionDays, 3, "distinct session days are counted rather than raw event count")
  assert.equal(events.stageMasteryFromEvidence(mixedAggregate, [{ mastered: true, recentAccuracy: 0.9 }]), true, "mixed mastery requires attempts, accuracy, and multiple session days")
  assert.equal(events.stageMasteryFromEvidence({ ...mixedAggregate, sessionDays: 2 }, [{ mastered: true, recentAccuracy: 0.9 }]), false, "two session days cannot grant full stage mastery")

  const permanentState = { rating: 1000, activeStages: { tactics: 2 }, stageMastery: { tactics: { 2: { permanentlyMastered: true } } } }
  const lowAccuracy = events.aggregateCurriculumEvents([focused("2026-07-04", 5)])
  assert.equal(events.regressionReason("tactics", lowAccuracy, permanentState, []), "low_accuracy", "low accuracy creates reinforcement")
  assert.equal(permanentState.stageMastery.tactics[2].permanentlyMastered, true, "regression preserves permanent mastery")
  assert.equal(events.regressionReason("tactics", events.aggregateCurriculumEvents([focused("2026-07-05", 9, 4)]), permanentState, []), "high_hints", "high hint use creates reinforcement")
  assert.equal(events.regressionReason("tactics", events.aggregateCurriculumEvents([focused("2026-07-06", 9, 0, 90_000)]), permanentState, []), "slow_solving", "slow solving creates reinforcement")
  assert.equal(events.regressionReason("tactics", themeBoundary, { ...permanentState, failedTransferTest: true }, []), "failed_transfer_test", "failed transfer tests create reinforcement")

  assert.throws(() => events.validateCurriculumEvent({ ...focused("2026-07-07"), area: "invalid" }), /Unknown curriculum area/, "area constraint is validated before persistence")
  assert.throws(() => events.validateCurriculumEvent({ ...focused("2026-07-08"), correctAttempts: 11 }), /Correct attempts/, "counter constraints are validated before persistence")
  assert.equal(selector.selectCurriculumItem({ state: { rating: 600, importedWeakness: "tactics" }, area: "tactics" }).difficultyCeiling, 2, "the dormant persistence model does not weaken Phase 1 ceilings")

  for (const table of [
    "user_curriculum_state", "user_curriculum_area_progress", "user_curriculum_stage_progress",
    "user_curriculum_theme_progress", "user_curriculum_session_evidence",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `${table} creates safely on an empty database and can be reapplied`)
  }
  assert.match(migration, /auth\.uid\(\) = user_id/, "owner-only RLS policy is present")
  assert.match(migration, /for all to authenticated using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\)/, "RLS rejects cross-user reads and writes by construction")
  assert.match(migration, /grant select, insert, update on table public\.%I to authenticated/, "authenticated users receive no delete grant")
  assert.doesNotMatch(migration, /grant .*delete/i, "migration does not grant delete")
  assert.match(migration, /generated always as identity/, "session evidence uses an identity sequence")
  assert.match(migration, /grant usage, select on sequence public\.user_curriculum_session_evidence_id_seq to authenticated/, "authenticated identity-sequence access is granted")
  assert.match(migration, /create or replace function public\.set_curriculum_updated_at/, "updated_at trigger function is present")
  assert.match(migration, /drop trigger if exists set_user_curriculum_state_updated_at/, "updated_at triggers are safely re-applied")
  assert.doesNotMatch(scheduler, /curriculum\//, "live scheduler remains independent in Phase 2A")

  console.log("PASS: deterministic curriculum persistence foundation")
  console.log("PASS: conservative seed, mastery, regression, migration contract, and scheduler isolation")
} finally {
  await vite.close()
}
