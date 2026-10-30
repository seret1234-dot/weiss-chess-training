import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
  const seed = await vite.ssrLoadModule("/src/training/curriculum/curriculumSeed.ts")
  const events = await vite.ssrLoadModule("/src/training/curriculum/curriculumEvents.ts")
  const persistence = await vite.ssrLoadModule("/src/training/curriculum/curriculumPersistence.ts")
  const selector = await vite.ssrLoadModule("/src/training/curriculum/selectCurriculumItem.ts")
  const migration = await readFile(new URL("../supabase/migrations/20260729_add_curriculum_progress.sql", import.meta.url), "utf8")
  const scheduler = await readFile(new URL("../src/training/getNextDueItem.ts", import.meta.url), "utf8")

  const profile = Object.freeze({
    estimated_rating: 620,
    target_rating: 1800,
    detected_ratings: { rapid: 900 },
    engine_analysis_summary: { byPhase: { opening: 2, middlegame: 45, endgame: 3 } },
    engine_analyzed_games_count: 12,
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
  const targetOnlySeed = seed.buildConservativeCurriculumSeed({ target_rating: 2000 })
  assert.equal(targetOnlySeed.state.ratingSnapshot, 600, "a target rating is never used to initialize a fresh curriculum")
  assert.equal(targetOnlySeed.state.ratingSource, "default", "no current-rating evidence uses the approved beginner default")
  assert.equal(seedOne.mappedEvidence.length, 1, "ambiguous historical progress cannot grant curriculum evidence")
  assert.equal(seedOne.mappedEvidence[0].trainerKey, "anastasia-mate-1", "clearly mapped history contributes only mapped evidence")
  assert.equal(seedOne.mappedEvidence[0].attempts, 12)
  assert.deepEqual(seedOne.state.legacyCategoryStats, {}, "missing legacy category data remains harmless context")
  assert.deepEqual(profile, {
    estimated_rating: 620, target_rating: 1800, detected_ratings: { rapid: 900 }, engine_analyzed_games_count: 12,
    engine_analysis_summary: { byPhase: { opening: 2, middlegame: 45, endgame: 3 } },
  }, "seeding never mutates the existing profile")
  assert.deepEqual(legacyRows, [
    { trainer_key: "anastasia-mate-1", is_mastered: true, mastered_puzzles_count: 12 },
    { trainer_key: "unknown-legacy-trainer", is_mastered: true, mastered_puzzles_count: 999 },
  ], "seeding never mutates existing progress rows")
  assert.equal(seedOne.areas.find((row) => row.area === "tactics").difficultyCeiling, 2, "imported tactical weakness cannot raise a beginner tactic ceiling")
  assert.equal(seed.importedWeaknessFromProfile({ engine_analyzed_games_count: 11, engine_analysis_summary: { byPhase: { middlegame: 40 } } }), null, "fewer than 12 analyzed games cannot alter the curriculum")
  const expired = persistence.stateFromRows({ rating_snapshot: 600, imported_weakness_area: null }, [{ area: 'tactics', current_stage: 2, difficulty_ceiling: 3, temporary_reinforcement: true, reinforcement_until: '2020-01-01T00:00:00.000Z' }], [], [])
  const active = persistence.stateFromRows({ rating_snapshot: 600, imported_weakness_area: null }, [{ area: 'tactics', current_stage: 2, difficulty_ceiling: 3, temporary_reinforcement: true, reinforcement_until: '2999-01-01T00:00:00.000Z' }], [], [])
  assert.equal(expired.temporaryReinforcement.tactics, false, 'expired reinforcement is not rehydrated as active')
  assert.equal(active.temporaryReinforcement.tactics, true, 'unexpired reinforcement remains active')
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
    focused("2026-07-01", 10), focused("2026-07-02", 10), focused("2026-07-03", 10),
  ])
  assert.equal(events.isThemeMastered(themeBoundary), true, "theme mastery requires the configured consecutive perfect chunks")
  assert.equal(events.isThemeMastered({ ...themeBoundary, consecutivePerfectChunks: 1 }), false, "one perfect chunk cannot grant theme mastery")

  const mixedEvents = [
    { ...focused("2026-07-01", 10), idempotencyKey: "mixed-1", eventKind: "mixed", attempts: 10, correctAttempts: 10 },
    { ...focused("2026-07-02", 10), idempotencyKey: "mixed-2", eventKind: "mixed", attempts: 10, correctAttempts: 10 },
    { ...focused("2026-07-03", 10), idempotencyKey: "mixed-3", eventKind: "mixed", attempts: 10, correctAttempts: 10 },
  ]
  const mixedAggregate = events.aggregateCurriculumEvents(mixedEvents)
  assert.equal(mixedAggregate.sessionDays, 3, "distinct session days are counted rather than raw event count")
  assert.equal(events.stageMasteryFromEvidence(mixedAggregate, [{ mastered: true, recentAccuracy: 0.9 }]), true, "mixed mastery requires attempts, accuracy, and multiple session days")
  assert.equal(events.stageMasteryFromEvidence({ ...mixedAggregate, sessionDays: 2 }, [{ mastered: true, recentAccuracy: 0.9 }]), true, "current stage mastery is governed by the approved perfect-chunk and theme criteria, not a redundant session-day gate")

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

  // Isolated durable-path regression for the real account sequence: the state
  // exists with a target fallback, then a Chess.com rapid rating arrives.
  // The profile update may alter only the derived rating fields; curriculum
  // progress/evidence rows remain untouched.
  const stateRow = {
    user_id: 'rating-user', curriculum_version: 1, rating_snapshot: 2000, rating_source: 'target',
    imported_weakness_area: null, category_weights: {}, legacy_category_stats: {}, seeded_from_existing_progress: true,
    source_profile_updated_at: '2026-10-30T21:06:40.000Z',
  }
  const areaRows = [{ user_id: 'rating-user', area: 'tactics', current_stage: 1, difficulty_ceiling: 4, category_weight: 30 }]
  const stageRows = [{ user_id: 'rating-user', area: 'tactics', stage_order: 1, attempts: 7, recent_attempts: 7, recent_correct_attempts: 6, mixed_attempts: 0, mixed_correct_attempts: 0, session_days: 2, permanent_mastery: false }]
  const themeRows = [{ user_id: 'rating-user', area: 'tactics', stage_order: 1, theme_key: 'bishop-fork', attempts: 7, correct_attempts: 6, average_solve_ms: 12000, hint_count: 0, permanent_mastery: false }]
  const lateImportProfile = { target_rating: 2000, detected_ratings: {}, engine_analysis_summary: {}, engine_analyzed_games_count: 0, updated_at: '2026-10-30T21:06:40.000Z' }
  let writes = 0
  const isolatedClient = {
    from(table) {
      const builder = {
        select() { return builder },
        eq() { return builder },
        maybeSingle() {
          const data = table === 'user_curriculum_state' ? stateRow : table === 'user_auto_profile' ? lateImportProfile : null
          return Promise.resolve({ data, error: null })
        },
        update(payload) {
          if (table === 'user_curriculum_state') { Object.assign(stateRow, payload); writes += 1 }
          return builder
        },
        then(resolve, reject) {
          const data = table === 'user_curriculum_area_progress' ? areaRows
            : table === 'user_curriculum_stage_progress' ? stageRows
              : table === 'user_curriculum_theme_progress' ? themeRows : []
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  }
  const beforeImport = await persistence.getOrCreateCurriculumState('rating-user', isolatedClient)
  assert.equal(beforeImport.curriculum.rating, 2000, 'the pre-import target seed remains unchanged without verified current-rating evidence')
  lateImportProfile.detected_ratings = { rapid: 605 }
  lateImportProfile.updated_at = '2026-10-30T21:07:58.000Z'
  const afterImport = await persistence.getOrCreateCurriculumState('rating-user', isolatedClient)
  assert.equal(stateRow.rating_snapshot, 605, 'late rapid import persistently replaces the target-derived snapshot')
  assert.equal(stateRow.rating_source, 'detected', 'the durable source records verified detected rating')
  assert.equal(afterImport.curriculum.rating, 605, 'the next Auto decision reads the reconciled beginner rating')
  assert.equal(afterImport.ratingSource, 'detected', 'refresh/debug reads the persisted verified rating source')
  assert.equal(afterImport.ratingReconciliation?.reconciled, true, 'the runtime retains an audit flag for this selection')
  assert.deepEqual(areaRows, [{ user_id: 'rating-user', area: 'tactics', current_stage: 1, difficulty_ceiling: 4, category_weight: 30 }], 'rating reconciliation preserves existing area progress')
  assert.equal(stageRows[0].attempts, 7, 'rating reconciliation preserves stage evidence')
  assert.equal(themeRows[0].attempts, 7, 'rating reconciliation preserves theme evidence')
  assert.equal(writes, 1, 'a stable detected rating is reconciled exactly once')
  await persistence.getOrCreateCurriculumState('rating-user', isolatedClient)
  assert.equal(writes, 1, 'refresh/resume does not rewrite a stable reconciled snapshot')

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
  console.log("PASS: target-to-detected rating reconciliation persists independently of curriculum progress and is idempotent on refresh")
} finally {
  await vite.close()
}
