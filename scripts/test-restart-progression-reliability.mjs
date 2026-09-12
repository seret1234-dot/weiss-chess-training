import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  createProgressionResetCoordinator,
  resetCourseProgressPersistence,
} from '../src/trainers/progressionRestart.mjs'

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries)
  }
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

function rowMatches(row, filters, inclusions) {
  return filters.every(([key, value]) => row[key] === value)
    && inclusions.every(([key, values]) => values.includes(row[key]))
}

function createSupabaseMock(seed, options = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, structuredClone(rows)]))
  const operations = []
  return {
    tables,
    operations,
    from(table) {
      tables[table] ??= []
      return {
        delete() {
          const filters = []
          const inclusions = []
          const query = {
            eq(key, value) { filters.push([key, value]); return query },
            in(key, values) { inclusions.push([key, [...values]]); return query },
            then(resolve, reject) {
              return Promise.resolve().then(() => {
                operations.push({ kind: 'delete', table, filters, inclusions })
                if (options.failDeleteTable === table) {
                  return { error: { message: `forced ${table} delete failure` } }
                }
                tables[table] = tables[table].filter((row) => !rowMatches(row, filters, inclusions))
                return { error: null }
              }).then(resolve, reject)
            },
          }
          return query
        },
        async upsert(payload) {
          operations.push({ kind: 'upsert', table, payload: structuredClone(payload) })
          if (options.failUpsertTable === table) return { error: { message: `forced ${table} upsert failure` } }
          const rows = Array.isArray(payload) ? payload : [payload]
          for (const row of rows) {
            const index = tables[table].findIndex((existing) =>
              existing.user_id === row.user_id
              && existing.trainer_key === row.trainer_key
              && existing.chunk_index === row.chunk_index)
            if (index >= 0) tables[table][index] = { ...tables[table][index], ...structuredClone(row) }
            else tables[table].push(structuredClone(row))
          }
          return { error: null }
        },
      }
    },
  }
}

const families = [
  {
    name: 'regular Tactics',
    active: 'tactic-back-rank-m1:full-chunks-v1',
    aliases: ['tactic-back-rank-m1', 'tactic-back-rank-m1:learner-v1'],
    untouched: ['tactic-bishop-fork-m1:full-chunks-v1', 'master-tactics:1:back-rank'],
    storageKey: 'pattern_tactic_progress_tactic-back-rank-m1:full-chunks-v1_v1',
  },
  {
    name: 'regular Mates',
    active: 'back-rank-mate-1:full-chunks-v1',
    aliases: ['back-rank-mate-1', 'back-rank-mate-1:m1-v1'],
    untouched: ['smothered-mate-1:full-chunks-v1', 'master-mates:1:back-rank'],
    storageKey: 'pattern_mate_progress_back-rank-mate-1:full-chunks-v1_v1',
  },
  {
    name: 'Master Tactics',
    active: 'master-tactics:2:bishop-fork',
    aliases: [],
    untouched: ['tactic-bishop-fork-m2:full-chunks-v1', 'master-tactics:2:queen-fork', 'master-mates:2:mixed'],
    storageKey: 'pattern_tactic_progress_master-tactics:2:bishop-fork_v1',
  },
  {
    name: 'Master Mates',
    active: 'master-mates:1:smothered',
    aliases: [],
    untouched: ['smothered-mate-1:full-chunks-v1', 'master-mates:1:back-rank', 'master-tactics:1:mixed'],
    storageKey: 'pattern_mate_progress_master-mates:1:smothered_v1',
  },
]

function progressedRows(userId, keys) {
  return keys.flatMap((trainerKey) => [1, 10, 50].map((chunkIndex) => ({
    user_id: userId,
    trainer_key: trainerKey,
    chunk_index: chunkIndex,
    mastered_puzzles_count: chunkIndex === 1 ? 7 : 24,
    is_mastered: true,
    mastered_at: '2026-09-01T00:00:00.000Z',
    review_stage: 3,
    last_reviewed_at: '2026-09-02T00:00:00.000Z',
    next_review_at: '2026-09-03T00:00:00.000Z',
  })))
}

for (const family of families) {
  const userId = 'user-1'
  const storage = new MemoryStorage([
    [family.storageKey, JSON.stringify({ currentChunkIndex: 49, currentPuzzleIndex: 12, chunkProgressByFile: { 'chunk-001.json': [{ fastSolves: 5 }], 'chunk-010.json': [{ fastSolves: 5 }], 'chunk-050.json': [{ fastSolves: 5 }] } })],
    ['weiss_piece_theme', 'classic'],
    ['weiss_board_coordinates', 'false'],
    ['unrelated-course-progress', 'keep-me'],
  ])
  const client = createSupabaseMock({
    user_chunk_progress: [
      ...progressedRows(userId, [family.active, ...family.aliases, ...family.untouched]),
      ...progressedRows('other-user', [family.active]),
    ],
    training_progress: [],
  })

  const result = await resetCourseProgressPersistence({
    client,
    userId,
    activeTrainerKey: family.active,
    relatedTrainerKeys: family.aliases,
    storage,
    storageKey: family.storageKey,
    now: () => '2026-09-05T00:00:00.000Z',
  })

  assert.deepEqual(result.trainerKeys, [family.active, ...family.aliases], `${family.name}: deterministic key scope`)
  const activeRows = client.tables.user_chunk_progress.filter((row) => row.user_id === userId && row.trainer_key === family.active)
  assert.deepEqual(activeRows, [{
    user_id: userId,
    trainer_key: family.active,
    chunk_index: 1,
    mastered_puzzles_count: 0,
    is_mastered: false,
    mastered_at: null,
    review_stage: 0,
    last_reviewed_at: null,
    next_review_at: null,
    updated_at: '2026-09-05T00:00:00.000Z',
  }], `${family.name}: partial/mastered/due/multi-chunk state resets to one clean first chunk`)
  assert.equal(client.tables.user_chunk_progress.some((row) => row.user_id === userId && family.aliases.includes(row.trainer_key)), false, `${family.name}: historical aliases cannot rehydrate stale progress`)
  for (const key of family.untouched) {
    assert.equal(client.tables.user_chunk_progress.filter((row) => row.user_id === userId && row.trainer_key === key).length, 3, `${family.name}: sibling namespace ${key} remains intact`)
  }
  assert.equal(client.tables.user_chunk_progress.filter((row) => row.user_id === 'other-user' && row.trainer_key === family.active).length, 3, `${family.name}: other users remain intact`)
  assert.equal(storage.getItem(family.storageKey), null, `${family.name}: local chunk/puzzle/fast-solve snapshot is removed`)
  assert.equal(storage.getItem('weiss_piece_theme'), 'classic', `${family.name}: piece preference is preserved`)
  assert.equal(storage.getItem('weiss_board_coordinates'), 'false', `${family.name}: coordinate preference is preserved`)
  assert.equal(storage.getItem('unrelated-course-progress'), 'keep-me', `${family.name}: unrelated local course state is preserved`)
}

{
  const storage = new MemoryStorage([['course-key', 'stale']])
  const client = createSupabaseMock({
    user_chunk_progress: progressedRows('user-1', ['course-key']),
    training_progress: [
      { user_id: 'user-1', course: 'Tactics', theme: 'Fork', item_id: 'a', mastery: 5 },
      { user_id: 'user-1', course: 'Tactics', theme: 'Pin', item_id: 'b', mastery: 5 },
      { user_id: 'other-user', course: 'Tactics', theme: 'Fork', item_id: 'c', mastery: 5 },
    ],
  })
  await resetCourseProgressPersistence({ client, userId: 'user-1', activeTrainerKey: 'course-key', storage, storageKey: 'course-key', studyCourse: 'Tactics', studyTheme: 'Fork' })
  assert.deepEqual(client.tables.training_progress, [
    { user_id: 'user-1', course: 'Tactics', theme: 'Pin', item_id: 'b', mastery: 5 },
    { user_id: 'other-user', course: 'Tactics', theme: 'Fork', item_id: 'c', mastery: 5 },
  ], 'per-puzzle server mastery reset is scoped to the exact course/theme and user')
}

{
  const coordinator = createProgressionResetCoordinator()
  let releasePending
  const pendingGate = new Promise((resolve) => { releasePending = resolve })
  const order = []
  const pending = coordinator.track(async () => {
    order.push('pending-started')
    await pendingGate
    order.push('pending-finished')
  })
  await Promise.resolve()
  const firstReset = coordinator.startReset().then((started) => { order.push('reset-drained'); return started })
  const duplicateReset = await coordinator.startReset()
  assert.equal(duplicateReset, false, 'rapid second click is rejected synchronously')
  assert.equal(coordinator.isResetting, true, 'coordinator remains resetting while an earlier write drains')
  assert.equal(await coordinator.track(() => { throw new Error('must not run') }), undefined, 'new progression writes are suppressed during reset')
  releasePending()
  assert.equal(await firstReset, true)
  await pending
  assert.deepEqual(order, ['pending-started', 'pending-finished', 'reset-drained'], 'earlier completion write drains before reset deletion may begin')
  coordinator.finishReset()
  assert.equal(coordinator.isResetting, false)
}

{
  const storage = new MemoryStorage([['course-key', 'must-survive-failure']])
  const client = createSupabaseMock({ user_chunk_progress: progressedRows('user-1', ['course-key']), training_progress: [] }, { failDeleteTable: 'user_chunk_progress' })
  await assert.rejects(
    resetCourseProgressPersistence({ client, userId: 'user-1', activeTrainerKey: 'course-key', storage, storageKey: 'course-key' }),
    /Could not reset chunk progression/,
    'server failures are surfaced instead of reporting a false successful reset',
  )
  assert.equal(storage.getItem('course-key'), 'must-survive-failure', 'local state is not cleared when durable reset fails')
}

{
  const tactic = await readFile(new URL('../src/trainers/patternTactic/PatternTacticTrainer.tsx', import.meta.url), 'utf8')
  const mate = await readFile(new URL('../src/trainers/patternMate/PatternMateTrainer.tsx', import.meta.url), 'utf8')
  const masterTactic = await readFile(new URL('../src/masterTactics/MasterTacticTrainer.tsx', import.meta.url), 'utf8')
  const masterMate = await readFile(new URL('../src/masterMates/MasterMateTrainer.tsx', import.meta.url), 'utf8')
  for (const [name, source] of [['Pattern Tactics', tactic], ['Pattern Mates', mate]]) {
    assert.match(source, /progressionResetRef\.current\.startReset\(\)/, `${name}: reset is coordinated`)
    assert.match(source, /disabled=\{restartingProgression\}/, `${name}: button is guarded`)
    assert.match(source, /progressionResetRef\.current\.track/, `${name}: completion writes are fenced`)
    assert.match(source, /resetCourseProgressPersistence\(/, `${name}: shared durable reset contract is used`)
  }
  assert.match(masterTactic, /master-tactics:\$\{distance\}:\$\{theme\}/, 'Master Tactics keeps its independent namespace')
  assert.match(masterMate, /master-mates:\$\{distance\}:\$\{theme\}/, 'Master Mates keeps its independent namespace')
}

console.log('Restart progression reliability checks passed:')
console.log('- partial, mastered, due-review, and chunks 1/10/50 reset for regular Tactics, regular Mates, Master Tactics, and Master Mates')
console.log('- first chunk is recreated with mastery/review timestamps cleared; local chunk, puzzle, and fast-solve state is removed')
console.log('- late writes drain, new writes are suppressed, rapid double-click is ignored, and server failures fail closed')
console.log('- sibling courses, Master/regular namespaces, other users, and unrelated preferences remain untouched')
