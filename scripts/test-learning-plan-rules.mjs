import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import {
  applyReviewOutcome,
  advancePerfectChunkStreak,
  backtrackBoardVisionCheckpoint,
  BOARD_VISION_PLACEMENT,
  buildActiveOpeningTracks,
  buildDifficultyCycle,
  CALCULATION_DEPTH_DISTRIBUTIONS,
  getBoardVisionPlacement,
  getMasterGameCadenceDays,
  getMasterGameOpeningSearch,
  getSpacedIntervalDays,
  PUZZLE_MASTERY_RULES,
  selectPreferredMasterGame,
  SPACED_REPETITION_LADDER_DAYS,
} from '../src/training/learningPlanRules.ts'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })

try {
const {
  buildPersonalTrainingPlan,
  PERMANENT_TRAINING_SECTION_ORDER,
  selectScheduledSection,
} = await vite.ssrLoadModule('/src/training/buildPersonalTrainingPlan.ts')
const {
  aggregateCurriculumEvents,
  isPerfectCurriculumChunk,
  isThemeMastered,
} = await vite.ssrLoadModule('/src/training/curriculum/curriculumEvents.ts')
const { isStageMastered } = await vite.ssrLoadModule('/src/training/curriculum/curriculumMastery.ts')

assert.deepEqual([...SPACED_REPETITION_LADER_FIXTURE()], [1, 2, 3, 5, 8, 15, 30, 60, 100, 140, 170, 270, 365])
assert.equal(getSpacedIntervalDays(0), 1)
assert.equal(getSpacedIntervalDays(12), 365)
assert.equal(getSpacedIntervalDays(50), 365, '365-day reviews continue yearly')

assert.deepEqual(applyReviewOutcome(0, 'perfect', 0), { reviewStage: 1, intervalDays: 1, activeTraining: false, consecutiveFailures: 0 })
assert.deepEqual(applyReviewOutcome(5, 'perfect', 0), { reviewStage: 6, intervalDays: 15, activeTraining: false, consecutiveFailures: 0 })
assert.equal(applyReviewOutcome(5, 'minor-weakness', 0).reviewStage, 4)
assert.equal(applyReviewOutcome(7, 'timing-failure', 0).reviewStage, 4)
assert.equal(applyReviewOutcome(7, 'silent-error', 0).reviewStage, 4)
assert.ok(applyReviewOutcome(7, 'wrong', 0).intervalDays <= 3)
assert.equal(applyReviewOutcome(7, 'wrong', 2).activeTraining, true)

assert.deepEqual(advancePerfectChunkStreak(0, true), { consecutivePerfectChunks: 1, mastered: false })
assert.deepEqual(advancePerfectChunkStreak(1, true), { consecutivePerfectChunks: 2, mastered: true })
assert.deepEqual(advancePerfectChunkStreak(1, false), { consecutivePerfectChunks: 0, mastered: false })
assert.equal(advancePerfectChunkStreak(29, false).consecutivePerfectChunks, 0, 'there is no fixed chunk cap')
assert.equal(PUZZLE_MASTERY_RULES.defaultChunkSize, 30)

const event = (id, correctAttempts = 30, hintCount = 0) => ({
  userId: 'u', idempotencyKey: id, area: 'tactics', stageOrder: 1,
  trainerKey: 'fork-1', route: '/tactics/m1/fork', eventKind: 'focused',
  attempts: 30, correctAttempts, hintCount, occurredOn: `2026-09-0${id}`,
})
assert.equal(isPerfectCurriculumChunk(event('1')), true)
assert.equal(isPerfectCurriculumChunk(event('2', 29)), false)
assert.equal(isThemeMastered(aggregateCurriculumEvents([event('1')])), false)
assert.equal(isThemeMastered(aggregateCurriculumEvents([event('1'), event('2')])), true)
assert.equal(isThemeMastered(aggregateCurriculumEvents([event('1'), event('2', 29)])), false)
assert.equal(isThemeMastered(aggregateCurriculumEvents([event('3', 29), event('1'), event('2')])), false, 'chunk streak is chronological, not query-order dependent')
assert.equal(isStageMastered({ permanentlyMastered: true, consecutivePerfectChunks: 0 }, []), false, 'historical mastery is revoked when current evidence no longer proves it')

assert.deepEqual(getBoardVisionPlacement(700), BOARD_VISION_PLACEMENT.beginner)
assert.deepEqual(getBoardVisionPlacement(1200), BOARD_VISION_PLACEMENT.intermediate)
assert.deepEqual(getBoardVisionPlacement(1800), BOARD_VISION_PLACEMENT.advanced)
assert.equal(backtrackBoardVisionCheckpoint(7, false), 4)
assert.equal(backtrackBoardVisionCheckpoint(4, false), 2)
assert.equal(backtrackBoardVisionCheckpoint(2, false), 0)
assert.equal(backtrackBoardVisionCheckpoint(4, true), 5)

assert.equal(getMasterGameCadenceDays(999), 60)
assert.equal(getMasterGameCadenceDays(1000), 30)
assert.equal(getMasterGameCadenceDays(1599), 30)
assert.equal(getMasterGameCadenceDays(1600), 7)

for (const [band, expected] of Object.entries(CALCULATION_DEPTH_DISTRIBUTIONS)) {
  const rating = band === 'beginner' ? 700 : band === 'intermediate' ? 1200 : 1800
  const cycle = buildDifficultyCycle(rating)
  const counts = Object.fromEntries([1, 2, 3, 4].map((depth) => [depth, cycle.filter((item) => item === depth).length]))
  assert.deepEqual(counts, expected)
  assert.ok(counts[1] > 0, `${band} must retain Tactic in 1`)
}

const openingProfile = {
  white: [
    { key: 'Italian Game', count: 24, avgScore: 0.51 },
    { key: 'London System', count: 4, avgScore: 0.49 },
  ],
  black: [
    { key: 'Caro-Kann vs e4', count: 20, avgScore: 0.52 },
    { key: "Queen's Gambit Declined vs d4", count: 15, avgScore: 0.50 },
    { key: 'Sicilian vs e4', count: 2, avgScore: 0.42 },
  ],
}
const beginnerTracks = buildActiveOpeningTracks(openingProfile, 800)
assert.deepEqual(beginnerTracks.map((track) => track.key), ['Italian Game', 'Caro-Kann vs e4', "Queen's Gambit Declined vs d4"])
assert.equal(buildActiveOpeningTracks(openingProfile, 1300).length, 5)
assert.equal(selectPreferredMasterGame([
  { id: 'a', opening: 'French Defense', eco: 'C10' },
  { id: 'b', opening: 'Italian Game Giuoco Piano', eco: 'C50' },
], beginnerTracks).id, 'b')
assert.equal(selectPreferredMasterGame([
  { id: 'a', opening: 'French Defense', eco: 'C10' },
  { id: 'b', opening: 'Italian Game Giuoco Piano', eco: 'C50' },
], ['e4 e5 Nf3 Nc6 Bc4 Nf6']).id, 'b', 'persisted move signatures normalize to Master Game opening metadata')
assert.equal(getMasterGameOpeningSearch('e4 c6 d4 d5 Nc3 dxe4'), 'Caro-Kann')

const plan = buildPersonalTrainingPlan({
  detected_ratings: { rapid: 800 },
  opening_profile: openingProfile,
})
assert.deepEqual(plan.sections.map((section) => section.key), [...PERMANENT_TRAINING_SECTION_ORDER])
assert.equal(plan.sections.reduce((sum, section) => sum + section.weight, 0), 100)
assert.equal(plan.sections.find((section) => section.key === 'masterGames').newMasterGameEveryDays, 60)
for (let index = 0; index < 200; index += 1) {
  assert.notEqual(selectScheduledSection(plan, index, ['boardVision']).key, 'boardVision', 'Board Vision can be excluded after one session chunk')
}

const autoSource = await readFile('src/pages/AutoStudyPage.tsx', 'utf8')
const runtimeSource = await readFile('src/training/curriculum/curriculumRuntime.ts', 'utf8')
const dueSource = await readFile('src/training/getNextDueItem.ts', 'utf8')
const persistenceSource = await readFile('src/training/curriculum/curriculumPersistence.ts', 'utf8')
assert.match(autoSource, /BOARD_VISION_SESSION_KEY/)
assert.match(autoSource, /excludedAreas: boardVisionDone/)
assert.match(autoSource, /master_game_last_introduced_at/, 'Auto derives new-game cadence from existing Master Game progress')
assert.match(autoSource, /preferredOpeningKeys\?\.\[0\]/, 'Auto carries the active opening into Master Games search')
assert.match(runtimeSource, /if \(dueReview\) return fallbackDecision/, 'due retention review is checked before new curriculum work')
assert.match(dueSource, /getNextDueReviewItem/, 'due review selection is independent of new Master Game cadence')
assert.match(dueSource, /bestRow\.is_mastered === true \? 'due_today'/, 'legacy mastered rows without a date remain reviewable')
assert.match(persistenceSource, /backtrackBoardVisionCheckpoint/, 'Board Vision failures persist an easier checkpoint')
assert.doesNotMatch(dueSource, /Math\.random/)

function SPACED_REPETITION_LADER_FIXTURE() {
  return SPACED_REPETITION_LADDER_DAYS
}

console.log('PASS: stable seven-section plan, rating depth mix, openings, Board Vision, cadence, mastery, and spaced regression')
} finally {
  await vite.close()
}
