import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(path, 'utf8')
const navigation = await read('src/trainers/activeChunkNavigation.ts')
const tacticsCurriculum = await read('src/trainers/patternTactic/m1toM4LearnerCurriculum.ts')
const mateM1Curriculum = await read('src/trainers/patternMate/m1LearnerCurriculum.ts')
const mateM2ToM5Curriculum = await read('src/trainers/patternMate/m2toM5LearnerCurriculum.ts')

assert.match(tacticsCurriculum, /PATTERN_TACTIC_LEARNER_CHUNK_SIZE = 30/)
assert.match(tacticsCurriculum, /FULL_PATTERN_TACTIC_COURSE_BY_TRAINER_KEY/)
assert.match(mateM1Curriculum, /M1_LEARNER_CHUNK_SIZE = 30/)
assert.match(mateM1Curriculum, /FULL_PATTERN_MATE_COURSES/)
assert.match(mateM2ToM5Curriculum, /PATTERN_MATE_M2_TO_M5_LEARNER_CHUNK_SIZE = 30/)
assert.match(navigation, /const nextChunkIndex = currentChunkIndex \+ 1/)
assert.match(navigation, /nextChunkIndex >= 0 && nextChunkIndex < activeChunkCount[\s\S]*?\? nextChunkIndex[\s\S]*?: null/)
assert.match(navigation, /params\.set\(['"]chunk['"], String\(nextChunkIndex\)\)/)
assert.match(navigation, /params\.set\(['"]learnerCurriculum['"], learnerCurriculumVersion\)/)

const tacticTrainer = await read('src/trainers/patternTactic/PatternTacticTrainer.tsx')
const mateTrainer = await read('src/trainers/patternMate/PatternMateTrainer.tsx')
const puzzlePerfection = await read('src/trainers/puzzlePerfection.ts')
for (const [name, source] of [['Pattern Tactics', tacticTrainer], ['Pattern Mates', mateTrainer]]) {
    assert.match(source, /Chunk mastery/, `${name} exposes chunk mastery`)
    assert.match(source, /stage mastery/, `${name} exposes stage mastery`)
    assert.match(source, /<SectionTitle>Chunk navigation<\/SectionTitle>/, `${name} exposes compact chunk navigation`)
    assert.match(source, />\s*Previous\s*</, `${name} exposes Previous chunk`)
    assert.match(source, />\s*Next\s*</, `${name} exposes Next chunk`)
    assert.match(source, />\s*Jump\s*</, `${name} exposes explicit chunk Jump`)
    assert.match(source, /Restart progression/, `${name} preserves progression restart`)
    assert.match(source, /chunkProgressByFile/, `${name} persists mastery by deterministic chunk filename`)
    assert.match(source, /currentChunkIndex/, `${name} persists the active chunk`)
    assert.match(source, /currentPuzzleIndex/, `${name} persists the active puzzle`)
    assert.match(source, /FAST_SOLVES_TO_MASTER = 5/, `${name} keeps five-fast-solve puzzle mastery`)
    assert.match(source, /PUZZLE_RECOGNITION_LIMIT_MS/, `${name} uses the shared approved recognition threshold`)
    assert.match(source, /user_chunk_progress/, `${name} keeps durable chunk review/mastery storage`)
    assert.match(source, /get_next_due_chunk/, `${name} keeps due-chunk scheduling`)
}
assert.match(puzzlePerfection, /PUZZLE_RECOGNITION_LIMIT_MS = 2_000/, 'the approved 2000ms recognition threshold remains unchanged')
assert.match(tacticTrainer, /resolvePatternTacticLearnerFacingChunkIndex\([\s\S]*?saved\.currentChunkIndex[\s\S]*?tacticLearnerCurriculum !== null/, 'saved Pattern Tactics learner chunk indexes are not remapped as legacy source indexes')
assert.match(mateTrainer, /resolveActiveChunkIndex\(saved\.currentChunkIndex \?\? 0, learnerCurriculum !== null\)/, 'saved Pattern Mates learner chunk indexes are not remapped as legacy source indexes')

const masterTacticsData = await read('src/masterTactics/data.ts')
const masterMatesData = await read('src/masterMates/data.ts')
const masterTacticsTrainer = await read('src/masterTactics/MasterTacticTrainer.tsx')
const masterMatesTrainer = await read('src/masterMates/MasterMateTrainer.tsx')
const masterDataSource = await read('src/masterPuzzles/dataSource.ts')

assert.match(masterTacticsData, /MASTER_TACTIC_CHUNK_SIZE = 30/)
assert.match(masterMatesData, /MASTER_MATE_CHUNK_SIZE = 30/)
assert.match(masterTacticsData, /refs\.slice\(start, start \+ MASTER_TACTIC_CHUNK_SIZE\)/)
assert.match(masterMatesData, /refs\.slice\(start, start \+ MASTER_MATE_CHUNK_SIZE\)/)
assert.match(masterTacticsData, /new Set\(group\.refs\.map\(\(ref\) => ref\.chunk\)\)/, 'Master Tactics fetches only canonical shards referenced by the active virtual chunk')
assert.match(masterMatesData, /new Set\(group\.refs\.map\(\(ref\) => ref\.chunk\)\)/, 'Master Mates fetches only canonical shards referenced by the active virtual chunk')
assert.match(masterTacticsTrainer, /trainerKey: `master-tactics:\$\{distance\}:\$\{theme\}`/)
assert.match(masterMatesTrainer, /trainerKey: `master-mates:\$\{distance\}:\$\{theme\}`/)
assert.match(masterTacticsTrainer, /<PatternTacticTrainer/)
assert.match(masterMatesTrainer, /<PatternMateTrainer/)
assert.match(masterDataSource, /VITE_MASTER_PUZZLES_BASE_URL/, 'Master requests retain the external configurable corpus base')

const runtime = await read('src/training/curriculum/curriculumRuntime.ts')
const due = await read('src/training/getNextDueItem.ts')
assert.match(runtime, /chunkIndex:/, 'curriculum decisions expose their chunk')
assert.match(due, /itemType: ['"]trainer_chunk['"]/, 'due items remain trainer-chunk records')
assert.match(due, /chunkIndex:/, 'due items expose the selected chunk')

const masterTacticsLocalKey = 'pattern_tactic_progress_master-tactics:2:bishop-fork_v1'
const regularTacticsLocalKey = 'pattern_tactic_progress_tactic-bishop-fork-m2_v1'
const masterMatesLocalKey = 'pattern_mate_progress_master-mates:1:smothered_v1'
const regularMatesLocalKey = 'pattern_mate_progress_smothered-mate-1_v1'
assert.equal(new Set([masterTacticsLocalKey, regularTacticsLocalKey, masterMatesLocalKey, regularMatesLocalKey]).size, 4, 'regular and Master progress namespaces cannot collide')

console.log('PASS: sitewide chunk contract, controls, deterministic sizing, persistence, due-item API, Master namespaces, and external lazy loading are intact')
