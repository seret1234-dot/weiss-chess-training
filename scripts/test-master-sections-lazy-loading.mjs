import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const dataSource = await readFile(new URL('../src/masterPuzzles/dataSource.ts', import.meta.url), 'utf8')
const tacticAdapter = await readFile(new URL('../src/masterTactics/data.ts', import.meta.url), 'utf8')
const mateAdapter = await readFile(new URL('../src/masterMates/data.ts', import.meta.url), 'utf8')
const tacticTrainer = await readFile(new URL('../src/masterTactics/MasterTacticTrainer.tsx', import.meta.url), 'utf8')
const mateTrainer = await readFile(new URL('../src/masterMates/MasterMateTrainer.tsx', import.meta.url), 'utf8')

assert.match(dataSource, /VITE_MASTER_PUZZLES_BASE_URL/)
assert.match(dataSource, /LOCAL_MASTER_PUZZLES_BASE_URL/)
assert.match(tacticAdapter, /loadMasterTacticIndex\(distance, theme\)/)
assert.match(tacticAdapter, /requestMasterPuzzleData<MasterCanonicalChunk>/)
assert.match(tacticAdapter, /canonicalChunkCache/)
assert.match(tacticAdapter, /group\.refs\.map/)
assert.doesNotMatch(tacticAdapter, /catalog\.json.*puzzles|allCanonical|1612/)
assert.match(mateAdapter, /loadMasterMateThemeIndex\(distance, theme\)/)
assert.match(mateAdapter, /canonicalChunkCache/)
assert.match(tacticTrainer, /dataSource/)
assert.match(mateTrainer, /dataSource/)
assert.match(tacticTrainer, /master-tactics:\$\{distance\}:\$\{theme\}/)
assert.match(mateTrainer, /master-mates:\$\{distance\}:\$\{theme\}/)
assert.doesNotMatch(tacticTrainer, /pattern_tactic_progress_|weiss:master-puzzles:v1/)

console.log('Master Tactics/Mates selected-index, selected-shard lazy-loading contract passed.')
