import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const identity = (record) => String(record?.puzzleId ?? record?.lichessId ?? record?.lichess_id ?? record?.PuzzleId ?? record?.localId ?? record?.id ?? '')
const recordsFrom = (value) => Array.isArray(value) ? value : value.puzzles ?? value.exercises ?? []

const inventory = await readJson('reports/chunks/full-chunk-inventory.json')
assert.deepEqual(inventory.totals.preCut, { chunks: 3201, puzzles: 94852 })
assert.deepEqual(inventory.totals.restored, { chunks: 3199, puzzles: 92526 })
assert.equal(inventory.deterministicTacticExclusions, 2084)
assert.equal(inventory.killBox.restoredTrainingPuzzles, 3814)
assert.equal(inventory.killBox.holdingNonTraining, 242)
assert.equal(inventory.killBox.reconciliation, 4056)

let checkedChunks = 0
let checkedPuzzles = 0
for (const course of inventory.courses) {
  const base = path.join('public', course.restoredPath.replace(/^\/data\//, 'data/'))
  const manifest = await readJson(path.join(base, 'manifest.json'))
  assert.equal(manifest.totalChunks, course.restoredChunks, `${course.key}: totalChunks`)
  assert.equal(manifest.totalPuzzles, course.restoredPuzzles, `${course.key}: totalPuzzles`)
  assert.deepEqual(manifest.files, course.chunkFiles, `${course.key}: deterministic file order`)
  assert.equal(manifest.curriculumVersion, 'full-precut-v1', `${course.key}: version`)

  const ids = []
  for (const file of manifest.files) {
    const records = recordsFrom(await readJson(path.join(base, file)))
    assert.ok(records.length > 0, `${course.key}/${file}: non-empty`)
    ids.push(...records.map(identity))
    checkedChunks += 1
    checkedPuzzles += records.length
  }
  assert.equal(ids.length, course.restoredPuzzles, `${course.key}: exact row count`)
  assert.equal(new Set(ids).size, course.uniquePuzzleCount, `${course.key}: exact unique-ID count`)
  assert.equal(ids.length - new Set(ids).size, course.duplicatePuzzleOccurrences, `${course.key}: historical duplicate occurrences are explicitly preserved`)
  assert.equal(sha256(ids.join('\n')), course.membershipHash, `${course.key}: exact membership/order hash`)
  for (const probe of [0, Math.floor(manifest.files.length / 2), manifest.files.length - 1]) {
    assert.ok(manifest.files[probe], `${course.key}: first/middle/final chunk is addressable`)
  }
}

assert.equal(checkedChunks, 3199)
assert.equal(checkedPuzzles, 92526)
assert.ok(Math.max(...inventory.courses.map((course) => course.restoredChunks)) >= 50, 'large historical courses are restored')
assert.ok(inventory.courses.every((course) => course.restoredChunks === course.preCutChunks), 'original chunk boundaries remain intact')

const killBoxIds = []
for (const course of inventory.courses.filter((entry) => entry.theme.startsWith('kill-box-'))) {
  const base = path.join('public', course.restoredPath.replace(/^\/data\//, 'data/'))
  for (const file of course.chunkFiles) killBoxIds.push(...recordsFrom(await readJson(path.join(base, file))).map(identity))
}
assert.equal(killBoxIds.length, 3814)
assert.equal(new Set(killBoxIds).size, 3814, 'approved Kill Box training assignments contain no duplicates')

const tacticTrainer = await readFile('src/trainers/patternTactic/PatternTacticTrainer.tsx', 'utf8')
const mateTrainer = await readFile('src/trainers/patternMate/PatternMateTrainer.tsx', 'utf8')
const tacticRoutes = await readFile('src/trainers/patternTactic/pageConfigs.ts', 'utf8')
assert.match(tacticTrainer, /const sourceFiles = \[fileName\]/, 'Pattern Tactics loads one selected mixed chunk')
assert.match(mateTrainer, /Promise\.all\(\[fileName\]\.map/, 'Pattern Mates loads one selected mixed chunk')
assert.doesNotMatch(tacticTrainer, /sessionSize: MIXED_SESSION_SIZE/)
assert.doesNotMatch(mateTrainer, /sessionSize: MIXED_SESSION_SIZE/)
assert.match(tacticRoutes, /patternTacticConfigByRoute = Object\.fromEntries\(\s*Object\.entries\(legacyPatternTacticConfigByRoute\)\.map/, 'all restored routes are retained by the explanation-enrichment map')
assert.match(tacticRoutes, /return \[route, \{ \.\.\.config, explanationKey \}\]/, 'explanation wiring preserves each route and its original configuration')
for (const [name, source] of [['Pattern Tactics', tacticTrainer], ['Pattern Mates', mateTrainer]]) {
  assert.match(source, /function navigateToChunk\(targetIndex: number\)[\s\S]*?buildNextActiveLearnerChunkUrl[\s\S]*?history\.replaceState[\s\S]*?loadChunkByIndex/, `${name}: manual chunk navigation is reload-stable`)
}

console.log(`PASS: ${inventory.courses.length} courses, ${checkedChunks} chunks, and ${checkedPuzzles} playable rows reconcile with preserved order and bounded lazy loading`)
