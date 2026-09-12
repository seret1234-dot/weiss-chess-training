import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { Chess } from 'chess.js'

// Bundle actual runtime modules, replacing only the database transport. No live writes.
const result = await build({ stdin: { contents: `
 export * from './src/training/weeklyAdaptiveTest'
 export * from './src/training/weeklyAssessment'
 export * from './src/training/weeklyAssessmentPersistence'
 export * from './src/training/weeklyReviewFlow'
 export * from './src/training/buildPersonalTrainingPlan'
 export * from './src/training/curriculum/curriculumEvents'
 export * from './src/training/curriculum/curriculumPersistence'
 export * from './src/training/curriculum/curriculumCatalog'
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'cjs', platform: 'node', write: false,
 external: ['chess.js'], plugins: [{ name: 'isolated-database', setup(b) {
  b.onLoad({ filter: /[\\/]lib[\\/]supabase\.ts$/ }, () => ({ contents: 'export const supabase = { from: (...args) => globalThis.__weeklyClient.from(...args) }', loader: 'js' }))
 } }] })
const mod = { exports: {} }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports)
export const runtime = mod.exports
const r = runtime
export const userId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
export const profile = { manual_current_rating: 800, onboarding_complete: true, daily_minutes: 20 }
const chess = new Chess()
for (let i = 0; i < 14; i++) for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) chess.move(move)
export const pgn = chess.pgn()
export const rows = chess.history({ verbose: true }).map((m, i) => ({ ply: i + 1, color: m.color }))
export const evidence = (ply = 51) => ({ rows, classifications: Object.fromEntries(rows.map(row => [row.ply, row.ply === ply ? 'Blunder' : 'Best'])), losses: Object.fromEntries(rows.map(row => [row.ply, row.ply === ply ? 400 : 0])), unavailable: {} })
export const stateFor = (result = '1/2-1/2') => ({ userId, weekKey: r.getCurrentWeekKey(), engineElo: 1500, currentGame: 2,
 completedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 games: ['white', 'black'].map(color => ({ color, started: true, completed: true, pgn, result, fen: chess.fen() })) })
export function database(state) {
 const tables = {
  weekly_adaptive_tests: [{ user_id: userId, week_key: state.weekKey, state: structuredClone(state), plan_signals: state.planSignals ?? null, completed_at: state.completedAt, updated_at: state.updatedAt }],
  user_curriculum_state: [{ user_id: userId, seeded_from_existing_progress: true, rating_snapshot: 800 }],
  user_curriculum_area_progress: ['mates', 'tactics'].map(area => ({ user_id: userId, area, current_stage: 1, difficulty_ceiling: 1 })),
  user_curriculum_stage_progress: [], user_curriculum_theme_progress: [], user_curriculum_session_evidence: [],
 }
 const writes = []
 const client = { tables, writes, from(table) {
  assert.ok(table in tables, `unexpected table ${table}`)
  let predicates = [], action = null, payload, conflict, single = false, options = {}, limit = Infinity
  const q = {
   select(_columns, opts = {}) { options = opts; return q },
   eq(key, value) { predicates.push(row => row[key] === value); return q },
   neq(key, value) { predicates.push(row => row[key] !== value); return q },
   not(key, _op, value) { predicates.push(row => row[key] !== value && row[key] !== undefined); return q },
   order() { return q }, limit(n) { limit = n; return q },
   maybeSingle() { single = true; return q },
   update(value) { action = 'update'; payload = value; return q },
   upsert(value, opts = {}) { action = 'upsert'; payload = value; conflict = opts.onConflict?.split(','); return q },
   then(resolve, reject) { return Promise.resolve().then(() => {
    let selected = tables[table].filter(row => predicates.every(p => p(row))).slice(0, limit)
    if (action) {
     writes.push({ table, action, payload: structuredClone(payload) })
     if (action === 'update') for (const row of selected) Object.assign(row, structuredClone(payload))
     else {
      selected = []
      for (const value of Array.isArray(payload) ? payload : [payload]) {
       let row = conflict && tables[table].find(row => conflict.every(key => row[key] === value[key]))
       if (!row) { row = {}; tables[table].push(row) }
       Object.assign(row, structuredClone(value)); selected.push(row)
      }
     }
    }
    return { data: structuredClone(single ? selected[0] ?? null : selected), count: selected.length, error: null }
   }).then(resolve, reject) },
  }
  return q
 } }
 return client
}
const weights = plan => plan.sections.map(s => s.weight)
const base = r.buildPersonalTrainingPlan(profile)
const coarseState = stateFor('0-1')
// Both losses, including mate evidence, without any invented tactical classification.
coarseState.games[1].result = '1-0'
const mateGame = new Chess(); for (const san of ['f3', 'e5', 'g4', 'Qh4#']) mateGame.move(san)
coarseState.games[0].pgn = mateGame.pgn()
const mateSignals = r.buildWeeklyPlanSignals(coarseState.games)
const matePlan = r.buildPersonalTrainingPlan(profile, mateSignals.assessment.sectionMultipliers)
assert.ok(matePlan.sections.find(s => s.key === 'masterMates').weight > base.sections.find(s => s.key === 'masterMates').weight)
assert.equal(mateSignals.assessment.analysisStatus, 'pending')
const mixedMisses = stateFor().games.map((game, index) => ({ ...game,
 transferOpportunities: Array.from({ length: 3 }, (_, id) => ({ id: `${index}-${id}`, targetKey: 'fixture', category: index ? 'tactics' : 'mates', status: 'missed' })),
}))
const sharedTransferBudget = r.buildWeeklyPlanSignals(mixedMisses).assessment.sectionMultipliers
assert.ok(Math.abs(sharedTransferBudget.masterMates + sharedTransferBudget.masterTactics - 2 - .18) < .00001, 'mate/tactic transfer evidence shares the existing total boost budget')
console.log('PASS A: outcome/Mates input changes active seven-section weights', weights(base), '→', weights(matePlan))

const state = stateFor()
const target = area => { const item = r.CURRICULUM_CATALOG.find(i => i.area === area && i.stageOrder === 1); return { patternKey: item.theme, label: item.theme, category: area, sourceTrainerKey: item.trainerKey, sourceRoute: item.route, trainedAt: new Date().toISOString() } }
for (const [index, status] of ['recognized', 'missed'].entries()) {
 const t = target(index ? 'tactics' : 'mates')
 state.games[index].transferTarget = t
 state.games[index].transferOpportunities = [{ id: `op-${index}`, targetKey: t.patternKey, targetLabel: t.label, category: t.category, status, computerMove: 'g8f6', expectedStudentMove: 'g1f3', createdAtPly: 1, createdAt: state.updatedAt }]
}
globalThis.__weeklyClient = database(state)
const client = globalThis.__weeklyClient
const one = await r.persistWeeklyReview(userId, state.weekKey, 0, pgn, evidence(51))
assert.equal(one.planSignals.assessment.gamesCompleted, true)
assert.equal(one.planSignals.assessment.analysisStatus, 'pending', 'one reviewed game is not final assessment')
assert.equal(one.planSignals.assessment.explainedReviewStatus, 'not_recorded')
const two = await r.persistWeeklyReview(userId, state.weekKey, 1, pgn, evidence(52))
assert.equal(two.planSignals.assessment.analysisStatus, 'complete')
assert.equal(two.planSignals.assessment.sectionMultipliers.endgames, 1.35)
const multipliers = await r.getWeeklyPlanMultipliers(userId)
const endPlan = r.buildPersonalTrainingPlan(profile, r.weeklySections(multipliers))
assert.ok(endPlan.sections.find(s => s.key === 'endgames').weight > base.sections.find(s => s.key === 'endgames').weight)
console.log('PASS B: persisted two-game engine evidence → existing helper → plan', weights(base), '→', weights(endPlan))
const events = client.tables.user_curriculum_session_evidence
assert.deepEqual(events.map(e => e.transfer_outcome), ['passed', 'failed'])
assert.ok(events.every(e => e.trainer_key === 'weekly-transfer-test' && e.event_kind === 'transfer'))
assert.equal(client.tables.user_curriculum_area_progress.find(a => a.area === 'tactics').reinforcement_reason, 'failed_transfer_test')
const aggregate = r.aggregateCurriculumEvents(events.map(e => ({ eventKind: e.event_kind, attempts: e.attempts, correctAttempts: e.correct_attempts })))
assert.equal(aggregate.attempts, 0); assert.equal(aggregate.consecutivePerfectChunks, 0)
assert.equal(await r.getCurriculumSelectionIndex(userId), 0, 'assessment is not a completed practice selection')
assert.equal(client.tables.user_curriculum_stage_progress.length, 0, 'no mastery awarded')
await r.persistWeeklyReview(userId, state.weekKey, 1, pgn, evidence(52))
assert.equal(events.length, 2, 'review retry never duplicates transfer evidence')
const newerLocal = JSON.stringify({ ...two, updatedAt: '2099-01-01T00:00:00Z', unsavedPlayMarker: true })
let localValue = newerLocal
globalThis.window = {}
globalThis.localStorage = { getItem: () => localValue, setItem: (_key, value) => { localValue = value } }
await r.persistWeeklyReview(userId, state.weekKey, 1, pgn, evidence(52))
assert.equal(JSON.parse(localValue).unsavedPlayMarker, true, 'saving analysis must not overwrite newer unsaved local play')
assert.equal(JSON.parse(localValue).updatedAt, '2099-01-01T00:00:00Z')
assert.equal(JSON.parse(localValue).games[1].analysis.status, 'complete', 'newer review-open metadata must not prevent assessment hydration')
delete globalThis.window; delete globalThis.localStorage
await assert.rejects(r.persistWeeklyReview(userId, state.weekKey, 1, '1. e4', evidence(52)), /does not match/)
console.log('PASS C: recognized/missed durable events, reinforcement, idempotency, no false mastery, PGN binding')
const partial = r.summarizeWeeklyReview(pgn, 'w', rows, evidence().classifications, evidence().losses, { 2: 'engine unavailable' })
assert.equal(partial.status, 'incomplete', 'opponent missing evaluation also prevents full-review claim')
const pending = r.deriveWeeklyAssessment([{ ...state.games[0], analysis: partial }, two.games[1]], { endgames: 1 })
assert.equal(pending.analysisStatus, 'pending'); assert.equal(pending.sectionMultipliers.endgames, 1)
const imported = { ...profile, engine_analyzed_games_count: 12, engine_analysis_summary: { byPhase: { opening: 0, middlegame: 40, endgame: 0 } } }
assert.equal(r.buildPersonalTrainingPlan(imported).analysisAvailable, true)
assert.deepEqual(r.buildPersonalTrainingPlan(imported), r.buildPersonalTrainingPlan(imported, {}))
assert.ok(r.buildPersonalTrainingPlan(imported, { endgames: 1.35 }).sections.find(s => s.key === 'endgames').weight > r.buildPersonalTrainingPlan(imported).sections.find(s => s.key === 'endgames').weight)
assert.equal(base.analysisAvailable, false, 'Weekly needs no imported-game minimum')
assert.deepEqual(r.buildPersonalTrainingPlan(profile, { endgames: 100 }), r.buildPersonalTrainingPlan(profile, { endgames: 1.35 }))
for (const plan of [base, matePlan, endPlan]) assert.equal(weights(plan).reduce((a, b) => a + b, 0), 100)
console.log('PASS D: imported weighting preserved; partial review withheld; bounded multipliers; no imported-game writes')
