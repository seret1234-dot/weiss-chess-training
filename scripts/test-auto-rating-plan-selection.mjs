import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/training/buildPersonalTrainingPlan';
      export * from './src/training/resolvePlanAutoActivity';
      export * from './src/training/curriculum/curriculumRuntime';
      export * from './src/training/curriculum/curriculumPersistence';
      export * from './src/training/curriculum/selectCurriculumItem';
      export { getDueStateFromRow, getChunkRows } from './src/training/getNextDueItem';
    `,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  define: { 'import.meta.env': '{}' },
  plugins: [{
    name: 'no-live-database',
    setup(build) {
      build.onLoad({ filter: /[\\/]OpeningTrainerPage\.tsx$/ }, () => ({ contents: 'export const canAutoTrainOpening = async () => true', loader: 'js' }))
      build.onLoad({ filter: /[\\/]MasterGamesPage\.tsx$/ }, () => ({ contents: 'export const canAutoTrainMasterGame = async () => true', loader: 'js' }))
      build.onLoad({ filter: /[\\/]lib[\\/]supabase\.ts$/ }, () => ({ contents: 'export const supabase = { rpc: async () => ({ data: [] }), from: () => ({ select(){ return this }, eq(){ return this }, not(){ return this }, order(){ return this }, range: async () => ({ data: [] }) }) }', loader: 'js' }))
    },
  }],
})

const module = { exports: {} }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const runtime = module.exports

function legacyNew() {
  return {
    source: 'legacy',
    legacyDueState: 'new',
    route: '/mates/m2/anastasia',
    trainerKey: 'anastasia-mate-2',
    chunkIndex: 0,
    selectionIndex: null,
    label: 'legacy new item',
    explanation: 'fixture',
  }
}

// Hold the content family constant so the measured cycle is M1–M4 tactics;
// mates also has legacy M5 routes whose label is outside this approved cycle.
const calculationAreas = ['mates', 'endgame-piece-mates', 'endgame-studies', 'openings', 'master-games', 'board-vision']
async function actualRuntimeDepthDistribution(rating) {
  const state = { rating, activeStages: {}, difficultyCeilings: {}, themeMastery: {} }
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (let depthSelectionIndex = 0; depthSelectionIndex < 100; depthSelectionIndex += 1) {
    // The area ordinal intentionally moves independently and cannot alter the
    // M1–M4 distribution. This exercises the real runtime, not the selector alone.
    const decision = await runtime.getCurriculumDecisionForUser('distribution-user', {
      getState: async () => ({ curriculum: state }),
      getSelectionIndex: async () => 700 + depthSelectionIndex,
      getDepthSelectionIndex: async () => depthSelectionIndex,
      getM1LearnerCompletion: async () => ({}),
      getLegacyItem: async () => null,
      getDueReviewItem: async () => null,
      excludedAreas: calculationAreas,
    })
    const stage = Number((decision?.route ?? '').match(/\/m([1-4])\//)?.[1])
    assert.ok(stage >= 1 && stage <= 4, `runtime selected a calculation stage for ${rating}: ${decision?.route ?? 'no route'}`)
    counts[stage] += 1
  }
  return counts
}

assert.deepEqual(await actualRuntimeDepthDistribution(600), { 1: 90, 2: 10, 3: 0, 4: 0 }, '600 Auto runtime uses the approved 90/10 cycle')
assert.deepEqual(await actualRuntimeDepthDistribution(1200), { 1: 35, 2: 50, 3: 15, 4: 0 }, '1200 Auto runtime uses the approved 35/50/15 cycle')
assert.deepEqual(await actualRuntimeDepthDistribution(1800), { 1: 15, 2: 35, 3: 35, 4: 15 }, '1800 Auto runtime uses the approved 15/35/35/15 cycle')

const unavailableCurriculum = async () => legacyNew()
const dependencies = {
  curriculum: unavailableCurriculum,
  opening: async () => null,
  masterGame: async () => null,
  masterPattern: async (_userId, family, depth) => ({
    route: `/${family}/${depth}/bishop-fork`,
    trainerKey: `${family}-${depth}-bishop-fork`,
    chunkIndex: 0,
  }),
}

const cases = [
  { rating: 600, route: /^\/tactics\/m1\//, section: 'tactics' },
  { rating: 1200, route: /^\/tactics\/m2\//, section: 'tactics' },
  { rating: 1800, route: /^\/master-tactics\/2\//, section: 'masterTactics' },
]

for (const test of cases) {
  const plan = runtime.buildPersonalTrainingPlan({ manual_current_rating: test.rating })
  const result = await runtime.resolvePlanAutoActivity(plan, legacyNew(), 'fixture-user', 0, [], dependencies)
  assert.match(result?.route ?? '', test.route, `${test.rating}: a new legacy fallback must not bypass the established plan`)
  assert.equal(result?.autoSelectionDebug?.trainingRating, test.rating)
  assert.equal(result?.autoSelectionDebug?.activePlanSection, test.section)
  assert.ok(result?.autoSelectionDebug?.selectionReason, `${test.rating}: the choice has a support explanation`)
}

const recoveredStarter = await runtime.resolvePlanAutoActivity(
  runtime.buildPersonalTrainingPlan({ manual_current_rating: 600 }), legacyNew(), 'fixture-user', 0, [], dependencies,
)
assert.match(recoveredStarter?.autoSelectionDebug?.selectionReason ?? '', /Curriculum persistence is unavailable/)

const detected = runtime.buildPersonalTrainingPlan({ detected_ratings: { rapid: 600 } })
assert.equal(detected.currentRating, 600, 'connected rapid rating initializes the starter plan before engine analysis')
assert.equal(detected.ratingSource, 'connected rapid rating')

// Exact production regression: a default 2000 target seed is created before
// importing a known 605 rapid rating. The durable curriculum snapshot must
// switch to the higher-priority verified rating without touching evidence.
const targetSeed = { rating_snapshot: 2000, rating_source: 'target' }
const imported605 = { target_rating: 2000, detected_ratings: { rapid: 605 } }
const ratingReconciliation = runtime.getCurriculumRatingReconciliation(targetSeed, imported605)
assert.deepEqual(ratingReconciliation, {
  reconciled: true,
  previousRating: 2000,
  previousSource: 'target',
  effectiveRating: 605,
  effectiveSource: 'detected',
}, 'a late Chess.com rapid rating replaces only the target-derived curriculum snapshot')
assert.equal(
  runtime.getCurriculumRatingReconciliation({ rating_snapshot: 605, rating_source: 'detected' }, { target_rating: 2000 }).reconciled,
  false,
  'a target rating can never overwrite a verified current rating',
)
const staleTargetSelection = runtime.selectCurriculumItem({ state: { rating: 2000 }, area: 'tactics', selectionIndex: 0, depthSelectionIndex: 0 })
const reconciled605Selection = runtime.selectCurriculumItem({ state: { rating: ratingReconciliation.effectiveRating }, area: 'tactics', selectionIndex: 0, depthSelectionIndex: 0 })
assert.match(staleTargetSelection?.route ?? '', /\/m2\//, 'the stale 2000 seed reproduces the first-slot M2 route')
assert.match(reconciled605Selection?.route ?? '', /\/m1\//, 'the reconciled 605 seed returns the first new route to M1')

const due = { ...legacyNew(), legacyDueState: 'due_today', route: '/mates/m1/anastasia' }
const dueResult = await runtime.resolvePlanAutoActivity(runtime.buildPersonalTrainingPlan({ manual_current_rating: 600 }), due, 'fixture-user', 0, [], dependencies)
assert.equal(dueResult?.route, due.route, 'a genuine due review still takes precedence over new plan material')
assert.equal(dueResult?.autoSelectionDebug?.activePlanSection, 'due-review')

const today = new Date('2026-10-30T00:00:00.000Z')
const tomorrow = new Date('2026-10-31T00:00:00.000Z')
const emptyLoaderRow = runtime.getDueStateFromRow({
  trainer_key: 'tactic-bishop-fork-m2:m2-verified-final-v1',
  chunk_index: 1,
  is_mastered: false,
  mastered_puzzles_count: 0,
  started_at: null,
}, today, tomorrow)
assert.equal(emptyLoaderRow.dueState, 'new', 'an untouched loader-created row is not resumable')

const emptyFallback = { ...legacyNew(), legacyDueState: emptyLoaderRow.dueState }
const emptyFallbackResult = await runtime.resolvePlanAutoActivity(
  runtime.buildPersonalTrainingPlan({ manual_current_rating: 600 }), emptyFallback, 'fresh-user', 0, [], dependencies,
)
assert.match(emptyFallbackResult?.route ?? '', /^\/tactics\/m1\//, 'an empty legacy row cannot override the 600 Elo plan')

const attemptedRow = runtime.getDueStateFromRow({
  trainer_key: 'tactic-bishop-fork-m2:m2-verified-final-v1',
  chunk_index: 1,
  is_mastered: false,
  mastered_puzzles_count: 0,
  started_at: '2026-10-30T12:00:00.000Z',
}, today, tomorrow)
assert.equal(attemptedRow.dueState, 'in_progress', 'a durable legal-move marker resumes an unfinished chunk after refresh')
const attemptedFallback = { ...legacyNew(), legacyDueState: attemptedRow.dueState, route: '/tactics/m2/bishop-fork?chunk=0' }
const attemptedFallbackResult = await runtime.resolvePlanAutoActivity(
  runtime.buildPersonalTrainingPlan({ manual_current_rating: 600 }), attemptedFallback, 'same-user-on-another-device', 0, [], dependencies,
)
assert.equal(attemptedFallbackResult?.route, attemptedFallback.route, 'a genuinely started chunk retains resume priority')

const completedRow = runtime.getDueStateFromRow({
  trainer_key: 'tactic-bishop-fork-m2:m2-verified-final-v1',
  chunk_index: 1,
  is_mastered: true,
  mastered_puzzles_count: 30,
  started_at: '2026-10-29T12:00:00.000Z',
}, today, tomorrow)
assert.equal(completedRow.dueState, 'due_today', 'completed chunks retain established review scheduling')

function chunkProgressClient(availableColumns, rows) {
  const attempts = []
  return {
    attempts,
    from(table) {
      assert.equal(table, 'user_chunk_progress')
      return {
        select(columns) {
          attempts.push(columns)
          return {
            eq() {
              const missing = columns.split(',').map(value => value.trim()).find(column => !availableColumns.has(column))
              return Promise.resolve(missing
                ? { data: null, error: { message: `column ${missing} does not exist` } }
                : { data: rows, error: null })
            },
          }
        },
      }
    },
  }
}

const currentProductionSchema = new Set(['trainer_key', 'chunk_index', 'next_review_at', 'is_mastered', 'mastered_puzzles_count'])
const migratedSchema = new Set([...currentProductionSchema, 'next_due_at', 'started_at'])
const durableStartedRow = [{
  trainer_key: 'tactic-bishop-fork-m2:m2-verified-final-v1', chunk_index: 1,
  is_mastered: false, mastered_puzzles_count: 0, next_review_at: null,
}]
const currentSchemaClient = chunkProgressClient(currentProductionSchema, durableStartedRow)
assert.deepEqual(await runtime.getChunkRows('schema-user', currentSchemaClient), durableStartedRow,
  'the current schema retries through both absent optional columns and retains progress rows')
assert.equal(currentSchemaClient.attempts.at(-1), 'trainer_key, chunk_index, next_review_at, is_mastered, mastered_puzzles_count',
  'both optional columns are removed before the stable current-schema query')
const migratedSchemaClient = chunkProgressClient(migratedSchema, [{ ...durableStartedRow[0], started_at: '2026-10-30T12:00:00.000Z', next_due_at: null }])
const migratedRows = await runtime.getChunkRows('schema-user', migratedSchemaClient)
assert.equal(migratedSchemaClient.attempts.length, 1, 'the migrated schema reads all optional fields in one query')
assert.equal(runtime.getDueStateFromRow(migratedRows[0], today, tomorrow).dueState, 'in_progress',
  'a migrated durable started marker remains resumable')

assert.equal(runtime.canUseRatingPlanAfterWeeklyAssessment('complete'), true, 'completed assessment uses the rating plan')
assert.equal(runtime.canUseRatingPlanAfterWeeklyAssessment('skipped'), true, 'skipped assessment uses the same rating plan')
assert.equal(runtime.canUseRatingPlanAfterWeeklyAssessment('due'), false)
assert.equal(runtime.canUseRatingPlanAfterWeeklyAssessment('in_progress'), false)

console.log('PASS: 600, 1200, and 1800 first Auto selections follow the established rating plan')
console.log('PASS: skipped and completed assessments share the rating-plan path; genuine due reviews retain priority')
console.log('PASS: Auto selection debug records rating, plan section, chosen route, and reason')
console.log('PASS: 100 actual runtime calculation selections per Elo band preserve independent approved depth distributions')
console.log('PASS: blank loader rows cannot override the Elo plan; durable started rows and completed reviews retain their priorities')
console.log('PASS: late verified ratings reconcile target-derived curriculum snapshots; 2000 target first-slot M2 becomes 605 first-slot M1')
console.log('PASS: current and migrated optional-column schemas both retain valid progress rows')
