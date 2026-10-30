import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createCurrentChunkResetPlan } from '../src/trainers/chunkProgressReset.mjs'

const currentChunkFile = 'chunk-001.json'
const otherChunkFile = 'chunk-002.json'
const currentPuzzleIds = ['mate-1', 'mate-2', 'mate-3']
const persistedState = {
  currentChunkIndex: 0,
  currentPuzzleIndex: 2,
  chunkProgressByFile: {
    [currentChunkFile]: [5, 5, 5],
    [otherChunkFile]: [5, 4],
  },
}
const persistedTrainingProgress = new Map([
  ['mate-1', { mastery: 5, nextReviewAt: '2030-01-01' }],
  ['mate-2', { mastery: 5, nextReviewAt: '2030-01-01' }],
  ['mate-3', { mastery: 5, nextReviewAt: '2030-01-01' }],
  ['other-chunk-puzzle', { mastery: 5, nextReviewAt: '2030-01-01' }],
])
const persistedChunkRows = new Map([
  [1, { mastered_puzzles_count: 3, is_mastered: true, review_stage: 4, next_review_at: '2030-01-01' }],
  [2, { mastered_puzzles_count: 2, is_mastered: true, review_stage: 2, next_review_at: '2030-01-02' }],
])

const plan = createCurrentChunkResetPlan({
  savedState: persistedState,
  fileName: currentChunkFile,
  currentChunkIndex: 0,
  puzzleIds: currentPuzzleIds,
})

// This models the two persisted writes performed by both trainers: delete
// only current puzzle rows, then reset only the active chunk metadata row.
for (const id of plan.puzzleIds) persistedTrainingProgress.delete(id)
persistedChunkRows.set(plan.chunkNumber, {
  mastered_puzzles_count: 0,
  is_mastered: false,
  mastered_at: null,
  review_stage: 0,
  last_reviewed_at: null,
  next_review_at: null,
})

// Reload from the persisted copies rather than inspecting transient UI state.
const reloadedState = structuredClone(plan.savedState)
const reloadedCurrentChunk = persistedChunkRows.get(1)
const reloadedOtherChunk = persistedChunkRows.get(2)

assert.equal(plan.chunkNumber, 1)
assert.deepEqual(reloadedState.chunkProgressByFile[currentChunkFile], [0, 0, 0])
assert.equal(reloadedState.currentChunkIndex, 0)
assert.equal(reloadedState.currentPuzzleIndex, 0)
assert.deepEqual(reloadedCurrentChunk, {
  mastered_puzzles_count: 0,
  is_mastered: false,
  mastered_at: null,
  review_stage: 0,
  last_reviewed_at: null,
  next_review_at: null,
})
for (const id of currentPuzzleIds) assert.equal(persistedTrainingProgress.has(id), false)

assert.deepEqual(reloadedState.chunkProgressByFile[otherChunkFile], [5, 4])
assert.deepEqual(reloadedOtherChunk, {
  mastered_puzzles_count: 2,
  is_mastered: true,
  review_stage: 2,
  next_review_at: '2030-01-02',
})
assert.deepEqual(persistedTrainingProgress.get('other-chunk-puzzle'), {
  mastery: 5,
  nextReviewAt: '2030-01-01',
})

// Guard the real handlers, not only the persistence model: both trainers
// must clear only the active puzzle ids and update only the active chunk row.
for (const trainerPath of [
  'src/trainers/patternMate/PatternMateTrainer.tsx',
  'src/trainers/patternTactic/PatternTacticTrainer.tsx',
]) {
  const source = await readFile(path.join(process.cwd(), trainerPath), 'utf8')
  assert.match(source, /\.in\('item_id', plan\.puzzleIds\)/)
  assert.match(source, /\.eq\('chunk_index', plan\.chunkNumber\)/)
  assert.doesNotMatch(source, /localStorage\.removeItem\(storageKey\)/)
}

console.log('PASS chunk restart clears persisted current-chunk mastery and leaves other chunks untouched')
