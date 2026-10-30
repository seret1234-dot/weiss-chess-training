import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/training/buildPersonalTrainingPlan';
      export * from './src/training/resolvePlanAutoActivity';
      export * from './src/training/curriculum/curriculumRuntime';
      export * from './src/training/curriculum/selectCurriculumItem';
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

const due = { ...legacyNew(), legacyDueState: 'due_today', route: '/mates/m1/anastasia' }
const dueResult = await runtime.resolvePlanAutoActivity(runtime.buildPersonalTrainingPlan({ manual_current_rating: 600 }), due, 'fixture-user', 0, [], dependencies)
assert.equal(dueResult?.route, due.route, 'a genuine due review still takes precedence over new plan material')
assert.equal(dueResult?.autoSelectionDebug?.activePlanSection, 'due-review')

assert.equal(runtime.canUseRatingPlanAfterWeeklyAssessment('complete'), true, 'completed assessment uses the rating plan')
assert.equal(runtime.canUseRatingPlanAfterWeeklyAssessment('skipped'), true, 'skipped assessment uses the same rating plan')
assert.equal(runtime.canUseRatingPlanAfterWeeklyAssessment('due'), false)
assert.equal(runtime.canUseRatingPlanAfterWeeklyAssessment('in_progress'), false)

console.log('PASS: 600, 1200, and 1800 first Auto selections follow the established rating plan')
console.log('PASS: skipped and completed assessments share the rating-plan path; genuine due reviews retain priority')
console.log('PASS: Auto selection debug records rating, plan section, chosen route, and reason')
