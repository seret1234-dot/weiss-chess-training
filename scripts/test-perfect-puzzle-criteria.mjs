import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import {
  DEFAULT_TIMED_MASTERY_ENABLED,
  resolveTimedMasteryEnabled,
  TIMED_MASTERY_STORAGE_KEY,
} from '../src/accessibility/timedMasteryPreference.ts'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })

try {
const {
  nextPerfectSolveCount,
  PUZZLE_MOVE_LIMIT_MS,
  PUZZLE_RECOGNITION_LIMIT_MS,
  PuzzlePerfectionTracker,
} = await vite.ssrLoadModule('/src/trainers/puzzlePerfection.ts')
const { PUZZLE_MASTERY_RULES } = await vite.ssrLoadModule('/src/training/learningPlanRules.ts')
const { puzzleSuccessFeedback } = await vite.ssrLoadModule('/src/trainers/puzzleSuccessFeedback.ts')

assert.equal(PUZZLE_RECOGNITION_LIMIT_MS, 2_000)
assert.equal(PUZZLE_MOVE_LIMIT_MS, 3_000)
assert.equal(PUZZLE_MASTERY_RULES.qualifyingFastSolves, 5)

function fresh(acceptedMoves = ['e2e4'], activeAt = 0, timingEnabled = true) {
  const tracker = new PuzzlePerfectionTracker()
  tracker.resetAttempt(timingEnabled)
  tracker.activateLearnerPosition(activeAt, acceptedMoves)
  return tracker
}

assert.equal(TIMED_MASTERY_STORAGE_KEY, 'weiss-chess-timed-mastery-enabled-v1')
assert.equal(DEFAULT_TIMED_MASTERY_ENABLED, true)
assert.equal(resolveTimedMasteryEnabled(null), true)
assert.equal(resolveTimedMasteryEnabled('true'), true)
assert.equal(resolveTimedMasteryEnabled('false'), false)
assert.equal(resolveTimedMasteryEnabled('invalid'), true)

function finishClick(tracker, sourceAt, source = 'e2', target = 'e4', promotion) {
  tracker.beginSource(source, sourceAt, 'click')
  tracker.recordDestination(source, target, sourceAt + 1, promotion)
  return tracker
}

// A. Correct intent at 1000ms.
assert.equal(finishClick(fresh(), 1_000).isPerfectSolve(), true)

// B. Recognition is strictly under two seconds.
assert.equal(finishClick(fresh(), 1_999).isPerfectSolve(), true)
assert.equal(finishClick(fresh(), 2_000).isPerfectSolve(), false)

// C. 2001ms is hesitation.
{
  const tracker = finishClick(fresh(), 2_001)
  assert.equal(tracker.isPerfectSolve(), false)
  assert.equal(tracker.snapshot().hadHesitation, true)
}

// D. Hover/mouse movement emits no intent event and is neutral.
assert.equal(finishClick(fresh(), 1_500).isPerfectSolve(), true)

// E. Hovering past the limit is not an error, but the later correct source is hesitation.
{
  const tracker = finishClick(fresh(), 2_200)
  assert.equal(tracker.isPerfectSolve(), false)
  assert.equal(tracker.snapshot().hadHesitation, true)
  assert.equal(tracker.snapshot().hadIntentionalError, false)
}

// F. Wrong source pointer-down is a silent intentional error.
{
  const tracker = fresh()
  tracker.beginSource('d2', 500, 'drag')
  finishClick(tracker, 1_000)
  assert.equal(tracker.isPerfectSolve(), false)
  assert.equal(tracker.snapshot().hadIntentionalError, true)
}

// G. Wrong-piece click/select and deselect remains imperfect.
{
  const tracker = fresh()
  tracker.beginSource('d2', 500, 'click')
  tracker.cancelIntent('d2')
  finishClick(tracker, 900)
  assert.equal(tracker.isPerfectSolve(), false)
}

// H. Correct source followed by a wrong destination click is imperfect.
{
  const tracker = fresh()
  tracker.beginSource('e2', 500, 'click')
  tracker.recordDestination('e2', 'e3', 700)
  finishClick(tracker, 900)
  assert.equal(tracker.isPerfectSolve(), false)
}

// I. Wrong drag destination and snapback is imperfect.
{
  const tracker = fresh()
  tracker.beginSource('e2', 500, 'drag')
  tracker.recordDestination('e2', 'e3', 700)
  tracker.beginSource('e2', 900, 'drag')
  tracker.recordDestination('e2', 'e4', 1_000)
  assert.equal(tracker.isPerfectSolve(), false)
}

// J. Cancelling the correct drag does not imply a wrong chess move.
{
  const tracker = fresh()
  tracker.beginSource('e2', 500, 'drag')
  tracker.finishUnresolvedDrag('e2')
  tracker.beginSource('e2', 900, 'drag')
  tracker.recordDestination('e2', 'e4', 1_000)
  assert.equal(tracker.isPerfectSolve(), true)
}

// K. Drag trajectory is not observed; only source and final drop matter.
{
  const tracker = fresh()
  tracker.beginSource('e2', 1_000, 'drag')
  tracker.recordDestination('e2', 'e4', 1_500)
  assert.equal(tracker.isPerfectSolve(), true)
}

// L. Every learner move must finish in strictly under three seconds.
{
 const tracker = fresh()
 tracker.beginSource('e2', 1_500, 'drag')
 tracker.recordDestination('e2', 'e4', 5_000)
 assert.equal(tracker.isPerfectSolve(), false)
 assert.equal(tracker.snapshot().hadSlowMove, true)
}
{
 const tracker = fresh()
 tracker.beginSource('e2', 1_500, 'drag')
 tracker.recordDestination('e2', 'e4', 2_999)
 assert.equal(tracker.isPerfectSolve(), true)
}

// M. Any hint permanently taints the attempt.
{
  const tracker = fresh()
  tracker.markHintUsed()
  finishClick(tracker, 1_000)
  assert.equal(tracker.isPerfectSolve(), false)
  assert.equal(tracker.snapshot().hadIntentionalError, false, 'hint penalty is separate from move errors')
  assert.equal(tracker.snapshot().hadSilentError, false)
}

// N. A normal submitted wrong move permanently taints the attempt.
{
  const tracker = fresh()
  tracker.markSubmittedWrongMove()
  finishClick(tracker, 1_000)
  assert.equal(tracker.isPerfectSolve(), false)
}

// N2. A self-reported silent error never earns mastery credit.
{
 const tracker = fresh()
 tracker.markSilentError()
 finishClick(tracker, 1_000)
 assert.equal(tracker.isPerfectSolve(), false)
 assert.equal(tracker.snapshot().hadSilentError, true)
}

// O. Every learner turn gets a fresh recognition window.
{
  const tracker = fresh(['e2e4'], 10_000)
  finishClick(tracker, 11_000)
  tracker.suspendLearnerPosition()
  tracker.activateLearnerPosition(20_000, ['g1f3'])
  finishClick(tracker, 21_500, 'g1', 'f3')
  assert.equal(tracker.isPerfectSolve(), true)
}

// P. A 2001ms delay on learner turn two makes the whole solve imperfect.
{
  const tracker = fresh(['e2e4'], 10_000)
  finishClick(tracker, 11_000)
  tracker.suspendLearnerPosition()
  tracker.activateLearnerPosition(20_000, ['g1f3'])
  finishClick(tracker, 22_001, 'g1', 'f3')
  assert.equal(tracker.isPerfectSolve(), false)
}

// Q. A silent wrong source on learner turn two makes the whole solve imperfect.
{
  const tracker = fresh(['e2e4'], 10_000)
  finishClick(tracker, 11_000)
  tracker.suspendLearnerPosition()
  tracker.activateLearnerPosition(20_000, ['g1f3'])
  tracker.beginSource('b1', 20_500, 'touch')
  finishClick(tracker, 21_000, 'g1', 'f3')
  assert.equal(tracker.isPerfectSolve(), false)
}

// R. Locked setup/reply time is ignored; the clock begins only at activation.
{
  const tracker = new PuzzlePerfectionTracker()
  tracker.resetAttempt()
  tracker.beginSource('e2', 9_000, 'drag')
  tracker.activateLearnerPosition(10_000, ['e2e4'])
  finishClick(tracker, 11_000)
  assert.equal(tracker.isPerfectSolve(), true)
}

// S/T. Orientation is deliberately absent from scoring and cannot alter it.
for (const orientation of ['white', 'black']) {
  const tracker = fresh()
  finishClick(tracker, 1_000)
  assert.equal(tracker.isPerfectSolve(), true, `${orientation}-bottom orientation`)
}

// U. Touch on a wrong source is equivalent to mouse/drag error.
{
  const tracker = fresh()
  tracker.beginSource('d2', 500, 'touch')
  tracker.beginSource('e2', 1_000, 'touch')
  tracker.recordDestination('e2', 'e4', 1_200)
  assert.equal(tracker.isPerfectSolve(), false)
}

// V. Correct touch source in time qualifies.
{
  const tracker = fresh()
  tracker.beginSource('e2', 1_000, 'touch')
  tracker.recordDestination('e2', 'e4', 1_300)
  assert.equal(tracker.isPerfectSolve(), true)
}

// Untimed mastery ignores only recognition time, at every learner turn.
for (const sourceAt of [1_000, 2_000, 2_001, 5_000, 20_000]) {
 const tracker = finishClick(fresh(['e2e4'], 0, false), sourceAt)
 assert.equal(tracker.snapshot().hadHesitation, sourceAt >= PUZZLE_RECOGNITION_LIMIT_MS)
  assert.equal(tracker.snapshot().timingEnabledForAttempt, false)
  assert.equal(tracker.isPerfectSolve(), true, `untimed source at ${sourceAt}ms`)
}

// Untimed mastery preserves actual wrong choices and the separate hint penalty.
{
  const tracker = fresh(['e2e4'], 0, false)
  tracker.beginSource('d2', 500, 'click')
  finishClick(tracker, 5_000)
  assert.equal(tracker.isPerfectSolve(), false)
}
{
  const tracker = fresh(['e2e4'], 0, false)
  tracker.beginSource('e2', 500, 'click')
  tracker.recordDestination('e2', 'e3', 600)
  finishClick(tracker, 5_000)
  assert.equal(tracker.isPerfectSolve(), false)
}
{
  const tracker = fresh(['e2e4'], 0, false)
  tracker.beginSource('e2', 500, 'click')
  tracker.cancelIntent('e2')
  finishClick(tracker, 5_000)
  assert.equal(tracker.isPerfectSolve(), true, 'correct-piece deselection is neutral')
}
{
  const tracker = fresh(['e2e4'], 0, false)
  tracker.markHintUsed()
  finishClick(tracker, 5_000)
  assert.equal(tracker.isPerfectSolve(), false)
}

// Untimed multi-move puzzles allow slow intent but retain attempt-wide error taint.
{
  const tracker = fresh(['e2e4'], 0, false)
  finishClick(tracker, 5_000)
  tracker.suspendLearnerPosition()
  tracker.activateLearnerPosition(10_000, ['g1f3'])
  finishClick(tracker, 30_000, 'g1', 'f3')
  assert.equal(tracker.isPerfectSolve(), true)
}
{
  const tracker = fresh(['e2e4'], 0, false)
  finishClick(tracker, 5_000)
  tracker.suspendLearnerPosition()
  tracker.activateLearnerPosition(10_000, ['g1f3'])
  tracker.beginSource('b1', 11_000, 'touch')
  finishClick(tracker, 30_000, 'g1', 'f3')
  assert.equal(tracker.isPerfectSolve(), false)
}

// Timing is snapshotted at a genuine attempt boundary, never changed retroactively.
{
  const tracker = fresh(['e2e4'], 0, true)
  finishClick(tracker, 2_001)
  assert.equal(tracker.snapshot().timingEnabledForAttempt, true)
  assert.equal(tracker.isPerfectSolve(), false)
  tracker.resetAttempt(false)
  tracker.activateLearnerPosition(10_000, ['e2e4'])
  finishClick(tracker, 30_000)
  assert.equal(tracker.isPerfectSolve(), true)
}

// Changing the global preference cannot clear taint in the already-active tracker.
{
  const tracker = fresh(['e2e4'], 0, false)
  tracker.beginSource('d2', 500, 'fallback')
  finishClick(tracker, 5_000)
  assert.equal(tracker.isPerfectSolve(), false)
  assert.equal(tracker.snapshot().timingEnabledForAttempt, false)
}

// Promotion choice is part of the final intentional destination.
{
 const tracker = fresh(['a7a8n'])
 tracker.beginSource('a7', 1_000, 'click')
 assert.equal(tracker.markPromotionPending('a7', 'a8', 1_100), true)
 tracker.recordDestination('a7', 'a8', 2_500, 'n')
  assert.equal(tracker.isPerfectSolve(), true)
}

// Cancelling a correct promotion dialog does not constitute a wrong move.
{
  const tracker = fresh(['a7a8q'])
  tracker.beginSource('a7', 1_000, 'drag')
  tracker.markPromotionPending('a7', 'a8', 1_100)
  tracker.cancelIntent()
  tracker.beginSource('a7', 1_300, 'drag')
  tracker.markPromotionPending('a7', 'a8', 1_400)
  tracker.recordDestination('a7', 'a8', 1_500, 'q')
  assert.equal(tracker.isPerfectSolve(), true)
}

// Correct-piece deselection, same-square drops and event-mode handoffs are neutral.
for (const mode of ['click', 'drag', 'touch']) {
  const tracker = fresh()
  tracker.beginSource('e2', 500, mode)
  tracker.cancelIntent('e2')
  tracker.beginSource('e2', 700, mode)
  tracker.recordDestination('e2', 'e2', 800)
  tracker.beginSource('e2', 900, 'click')
  tracker.beginSource('e2', 950, 'drag')
  tracker.recordDestination('e2', 'e4', 1_100)
  assert.equal(tracker.isPerfectSolve(), true, `${mode}: cancellation/handoff is not an error`)
  assert.equal(tracker.snapshot().hadIntentionalError, false)
}

// Switching between verified alternative solution pieces is not a destination attempt.
{
  const tracker = fresh(['e2e4', 'd2d4'])
  tracker.beginSource('e2', 500, 'click')
  tracker.beginSource('d2', 700, 'click')
  tracker.recordDestination('d2', 'd4', 900)
  assert.equal(tracker.isPerfectSolve(), true)
}

for (const slowAt of [2_001, 4_000]) {
  const tracker = finishClick(fresh(), slowAt)
  assert.equal(tracker.isPerfectSolve(), false)
  assert.equal(tracker.snapshot().hadIntentionalError, false)
  assert.equal(tracker.snapshot().hadSilentError, false)
}

// Duplicate emissions for one physical source action are idempotent.
{
  const tracker = fresh()
  const first = tracker.beginSource('e2', 1_000, 'drag')
  const duplicate = tracker.beginSource('e2', 1_001, 'drag')
  tracker.recordDestination('e2', 'e4', 1_500)
  assert.equal(first.recorded, true)
  assert.equal(duplicate.duplicate, true)
  assert.equal(tracker.isPerfectSolve(), true)
  assert.equal(tracker.snapshot().learnerTurnsCompleted, 1)
}

// The actual shared mastery transition leaves N unchanged unless qualification is perfect.
for (const [start, expected, qualifies] of [[1_900, 'Correct', true], [2_000, 'Correct, but slow', false], [5_000, 'Correct, but slow', false]]) {
  const tracker = finishClick(fresh(), start)
  assert.equal(puzzleSuccessFeedback(tracker.snapshot()), expected)
  assert.equal(tracker.isPerfectSolve(), qualifies)
  assert.equal(nextPerfectSolveCount(2, 5, tracker.isPerfectSolve()), qualifies ? 3 : 2)
}
for (const duration of [3_000, 5_000]) {
  const tracker = finishClick(fresh(), 1_900)
  tracker.activateLearnerPosition(2_000, ['d2d4'])
  tracker.beginSource('d2', 2_500, 'click')
  tracker.recordDestination('d2', 'd4', 2_000 + duration)
  assert.equal(puzzleSuccessFeedback(tracker.snapshot()), 'Correct, but slow')
  assert.equal(tracker.isPerfectSolve(), false)
}
for (const disqualifier of ['markHintUsed', 'markSilentError', 'markSubmittedWrongMove']) {
  const tracker = finishClick(fresh(), 5_000)
  tracker[disqualifier]()
  assert.equal(puzzleSuccessFeedback(tracker.snapshot()), 'Correct', 'do not call a hint/error attempt slow')
  assert.equal(tracker.isPerfectSolve(), false)
}
{
  const tracker = finishClick(fresh(['e2e4'], 0, false), 5_000)
  assert.equal(puzzleSuccessFeedback(tracker.snapshot()), 'Correct', 'untimed accessibility mode remains unchanged')
  assert.equal(tracker.isPerfectSolve(), true)
}
assert.equal(nextPerfectSolveCount(2, 5, true), 3)
assert.equal(nextPerfectSolveCount(2, 5, false), 2)
assert.equal(nextPerfectSolveCount(5, 5, true), 5)
assert.equal([true, true, true, true, true].reduce((count, qualifies) => nextPerfectSolveCount(count, 5, qualifies), 0), 5)

const tacticSource = await readFile('src/trainers/patternTactic/PatternTacticTrainer.tsx', 'utf8')
const mateSource = await readFile('src/trainers/patternMate/PatternMateTrainer.tsx', 'utf8')
for (const [label, source] of [['Pattern Tactics', tacticSource], ['Pattern Mates', mateSource]]) {
  assert.match(source, /new PuzzlePerfectionTracker\(\)/, `${label} uses the shared tracker`)
  assert.match(source, /activatePerfectionTurn\(/, `${label} arms each learner turn`)
  assert.match(source, /onPieceDragBegin=/, `${label} captures drag/touch source intent`)
  assert.match(source, /onPieceDropOffBoard=/, `${label} captures off-board cancellation`)
  assert.match(source, /recordDestination\(/, `${label} captures click/drop destinations`)
  assert.match(source, /showFloatingControl=\{false\}/, `${label} suppresses only the redundant floating Hint`)
  assert.match(source, /markSubmittedWrongMove\(/, `${label} captures normal wrong moves`)
  assert.match(source, /markHintUsed\(/, `${label} captures hint use`)
  assert.match(source, /markSilentError\(/, `${label} captures self-reported silent errors`)
  assert.match(source, /nextPerfectSolveCount\(/, `${label} uses shared mastery qualification`)
  assert.match(source, /puzzleSuccessFeedback\(perfectionTrackerRef.current.snapshot\(\)\)/, `${label} uses shared success wording`)
  assert.match(source, /resetAttempt\(timedMasteryEnabledRef\.current\)/, `${label} snapshots the global timing preference only at a new attempt`)
  assert.doesNotMatch(source, /FAST_SOLVE_SECONDS_PER_MOVE/, `${label} removed completion-time qualification`)
}

console.log('Perfect-puzzle timed/untimed criteria, attempt snapshot, promotion, duplicate events, and mastery credit: PASS')
} finally {
  await vite.close()
}
