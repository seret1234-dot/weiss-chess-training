import assert from 'node:assert/strict'
import { runtime as r, database, userId, pgn, rows, evidence, stateFor } from './test-weekly-assessment-dataflow.mjs'

const state = stateFor(), client = database(state)
const snapshot = { classifications: evidence().classifications, losses: evidence().losses, best: {}, unavailable: {}, lines: {},
 coverage: { white: { eligible: 28, evaluated: 28, unavailable: 0 }, black: { eligible: 28, evaluated: 28, unavailable: 0 } }, counts: {}, accuracyWhite: 99, accuracyBlack: 99 }
let saved = await r.persistWeeklyReview(userId, state.weekKey, 0, pgn, { ...evidence(), snapshot }, client)
assert.equal(saved.games[0].explainedReview.currentPly, 0)
assert.equal(saved.planSignals.assessment.explainedReviewStatus, 'in_progress')
assert.ok(r.pendingWeeklyReviewRoute(saved).includes('weeklyGame=1'))
const writes = client.writes.length
await r.persistWeeklyReview(userId, state.weekKey, 0, pgn, { ...evidence(), snapshot }, client)
assert.equal(client.writes.length, writes, 'restored analysis is not persisted twice')
const save = (index, ply, complete = false) => r.persistWeeklyExplainedReview(userId, state.weekKey, index, pgn, ply, complete, client)
await save(0, rows.length)
await assert.rejects(save(0, rows.length, true), /every move in order/, 'Last may not skip explained review')
await save(0, 0)
for (let ply = 1; ply <= rows.length; ply++) {
 saved = await save(0, ply)
 if (ply === 3) {
  await save(0, 2); saved = await save(0, 3)
  assert.equal(saved.games[0].explainedReview.furthestPly, 3, 'Previous preserves ordered progress')
 }
}
const beforeWeights = structuredClone(saved.planSignals.assessment.sectionMultipliers)
saved = await save(0, rows.length, true)
assert.ok(saved.games[0].explainedReview.completedAt)
assert.deepEqual(saved.planSignals.assessment.sectionMultipliers, beforeWeights, 'UX completion cannot change weights')
const completionWrites = client.writes.length
await save(0, rows.length, true); await save(0, 1)
assert.equal(client.writes.length, completionWrites, 'duplicate completion / stale Previous cannot relaunch or overwrite')
assert.ok(r.pendingWeeklyReviewRoute(saved).includes('weeklyGame=2'))
saved = await r.persistWeeklyReview(userId, state.weekKey, 1, pgn, { ...evidence(52), snapshot }, client)
assert.equal(saved.planSignals.assessment.analysisStatus, 'complete', 'analysis ready before UX review finished')
for (let ply = 1; ply <= rows.length; ply++) await save(1, ply)
const beforeFinal = client.tables.weekly_adaptive_tests[0].state
saved = await save(1, rows.length, true)
assert.ok(saved.reviewFlowCompletedAt)
assert.equal(saved.completedAt, state.completedAt, 'game completion semantics unchanged')
assert.equal(saved.planSignals.assessment.explainedReviewStatus, 'complete')
assert.deepEqual(saved.planSignals.assessment.sectionMultipliers, beforeFinal.planSignals.assessment.sectionMultipliers)
assert.equal(r.pendingWeeklyReviewRoute(saved), null)
assert.equal(r.pendingWeeklyReviewRoute(stateFor()), null, 'historical completion not reopened')
assert.ok(client.writes.every(w => w.table === 'weekly_adaptive_tests'), 'UX never awards mastery/transfer twice')
await assert.rejects(r.persistWeeklyExplainedReview(userId, state.weekKey, 1, '1. e4', 1, false, client), /Complete saved analysis/)
console.log('PASS ordered review, Previous/Last, PGN binding, durable position, idempotent completion, analysis/UX separation, weights unchanged')

// Explicit skip is a terminal UX disposition, never sequential completion or new evidence.
const skipState = { ...stateFor(), currentGame: 0 }, skipClient = database(skipState)
for (let i = 0; i < 2; i++) await r.persistWeeklyReview(userId, skipState.weekKey, i, pgn, { ...evidence(i ? 52 : 51), snapshot }, skipClient)
const skipSave = (i, ply, outcome = false) => r.persistWeeklyExplainedReview(userId, skipState.weekKey, i, pgn, ply, outcome, skipClient)
const baseline = structuredClone(skipClient.tables.weekly_adaptive_tests[0].state)
await skipSave(0, 1); await skipSave(0, 2); await skipSave(0, rows.length)
await assert.rejects(skipSave(0, rows.length, true), /every move in order/)
let skipped = await skipSave(0, rows.length, 'skip')
assert.ok(skipped.games[0].explainedReview.skippedAt)
assert.equal(skipped.games[0].explainedReview.completedAt, undefined)
assert.equal(skipped.games[0].explainedReview.furthestPly, 2)
assert.equal(r.explainedReviewComplete(skipped.games[0]), false)
assert.equal(r.explainedReviewResolved(skipped.games[0]), true)
assert.equal(skipped.currentGame, 1)
assert.ok(r.pendingWeeklyReviewRoute(skipped).includes('weeklyGame=2'))
const skipWrites = skipClient.writes.length
await skipSave(0, rows.length, 'skip'); await skipSave(0, 3); await skipSave(0, rows.length, true)
assert.equal(skipClient.writes.length, skipWrites, 'duplicate skip and stale autoplay/navigation cannot overwrite skip')
skipped = await skipSave(1, 0, 'skip')
assert.ok(skipped.reviewFlowCompletedAt)
assert.equal(skipped.planSignals.assessment.explainedReviewStatus, 'skipped')
assert.equal(r.pendingWeeklyReviewRoute(JSON.parse(JSON.stringify(skipped))), null, 'durable skip does not reopen on refresh')
assert.deepEqual(skipped.planSignals.assessment.sectionMultipliers, baseline.planSignals.assessment.sectionMultipliers)
assert.equal(skipped.planSignals.assessment.analysisStatus, baseline.planSignals.assessment.analysisStatus)
assert.equal(skipped.completedAt, baseline.completedAt)
for (let i = 0; i < 2; i++) {
 for (const field of ['pgn','fen','analysis','analysisSnapshot','transferEvidenceKeys']) assert.deepEqual(skipped.games[i][field], baseline.games[i][field], field)
}
assert.ok(skipClient.writes.every(w => w.table === 'weekly_adaptive_tests'))
console.log('PASS explicit skip after Last, skipped vs reviewed, Game 2 continuation, idempotence, refresh, unchanged analysis/weights/transfer')
