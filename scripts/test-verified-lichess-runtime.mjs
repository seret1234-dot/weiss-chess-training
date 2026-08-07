import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Chess } from 'chess.js'

const root = process.cwd()
const corpus = path.join(root, 'public', 'data', 'verified-lichess-tactics-v1', 'final-v5')
const index = JSON.parse(fs.readFileSync(path.join(corpus, 'index.json'), 'utf8'))
const sourceIds = new Set()
const exerciseIds = new Set()
let replayed = 0
for (const course of index.courses.filter(course => course.theme !== 'mixed')) {
  const directory = path.join(corpus, `${course.theme}-${course.stage.toLowerCase()}`)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
  assert.equal(manifest.exerciseCount, course.exerciseCount, `${course.theme} ${course.stage} manifest count`)
  assert.equal(manifest.chunks.reduce((sum, chunk) => sum + chunk.count, 0), manifest.exerciseCount, `${course.theme} ${course.stage} chunk total`)
  for (const chunk of manifest.chunks) {
    const payload = JSON.parse(fs.readFileSync(path.join(directory, chunk.file), 'utf8'))
    assert.equal(payload.exercises.length, chunk.count, `${chunk.file} count`)
    for (const exercise of payload.exercises) {
      assert.ok(exercise.exerciseId && exercise.sourcePuzzleId, 'provenance identity required')
      assert.ok(!sourceIds.has(exercise.sourcePuzzleId), `duplicate source ID ${exercise.sourcePuzzleId}`)
      assert.ok(!exerciseIds.has(exercise.exerciseId), `duplicate exercise ID ${exercise.exerciseId}`)
      sourceIds.add(exercise.sourcePuzzleId)
      exerciseIds.add(exercise.exerciseId)
      assert.equal(exercise.provenance?.corpus, 'verified-lichess-final-v5', 'approved runtime provenance')
      assert.ok(['STRUCTURALLY_VERIFIED', 'MECHANISM_SUPPORTED_ENGINE_REQUIRED'].includes(exercise.structuralValidation), 'approved structural validation required')
      assert.equal(exercise.engineValidation?.outcome, 'APPROVED', 'individual engine approval required')
      const game = new Chess(exercise.fen)
      for (const uci of exercise.solutionLine) {
        const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })
        assert.ok(move, `illegal runtime replay ${exercise.sourcePuzzleId} ${uci}`)
      }
      assert.deepEqual(exercise.userMoveIndexes, exercise.stage === 'M2' ? [0, 2] : [0], `${exercise.sourcePuzzleId} stage structure`)
      replayed++
    }
  }
}
assert.equal(index.totalExercises, 3907)
assert.equal(sourceIds.size, 3907)
assert.equal(exerciseIds.size, 3907)
for (const stage of ['M1', 'M2']) {
  const mixed = index.courses.find(course => course.theme === 'mixed' && course.stage === stage)
  assert.ok(mixed && mixed.path && mixed.chunkCount === 1, `mixed ${stage} manifest required`)
  const manifest = JSON.parse(fs.readFileSync(path.join(corpus, `mixed-${stage.toLowerCase()}`, 'manifest.json'), 'utf8'))
  assert.deepEqual([...manifest.sourceThemes].sort(), [...mixed.sources].sort(), `mixed ${stage} active themes`)
}
const pageConfigs = fs.readFileSync(path.join(root, 'src', 'trainers', 'patternTactic', 'pageConfigs.ts'), 'utf8')
const trainerRuntime = fs.readFileSync(path.join(root, 'src', 'trainers', 'patternTactic', 'PatternTacticTrainer.tsx'), 'utf8')
for (const course of index.courses.filter(course => course.theme !== 'mixed')) {
  const route = `m${course.stage.slice(1)}/${course.theme}`
  assert.ok(pageConfigs.includes(`"${route}"`), `focused runtime route required for ${route}`)
}
assert.match(trainerRuntime, /final-v5\/mixed-m\$\{tacticDistance\}/, 'mixed runtime uses the final verified corpus')
assert.doesNotMatch(trainerRuntime, /tacticLearnerCurriculum\?\.learnerDataBasePath \?\? config\.dataBasePath/, 'focused runtime cannot fall back to legacy data')
console.log(JSON.stringify({ passed: true, replayed, sources: sourceIds.size, exercises: exerciseIds.size }, null, 2))
