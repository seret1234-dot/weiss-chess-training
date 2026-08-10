import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const corpus = path.join(root, 'public', 'data', 'verified-lichess-tactics-v1', 'final-v6')
const index = JSON.parse(fs.readFileSync(path.join(corpus, 'index.json'), 'utf8'))
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })

try {
 const trainingSequence = await vite.ssrLoadModule('/src/trainers/patternTactic/trainingSequence.ts')

 const longM1 = trainingSequence.createInteractiveTrainingSequence({
  sourceSolutionLine: ['a1a2', 'a8a7', 'b1b2', 'b8b7', 'c1c2', 'c8c7'],
  userMoveIndexes: [0, 2, 4],
  stage: 'M1',
 })
 assert.deepEqual(longM1.moves, ['a1a2'], 'M1 training sequence ends at learner move one')
 assert.deepEqual(
  trainingSequence.getOpponentMovesBeforeNextRequiredLearnerMove(longM1, 1),
  [],
  'M1 never autoplays source continuation after solve',
 )

 const longM2 = trainingSequence.createInteractiveTrainingSequence({
  sourceSolutionLine: ['a1a2', 'a8a7', 'b1b2', 'b8b7', 'c1c2', 'c8c7', 'd1d2', 'd8d7'],
  userMoveIndexes: [0, 2, 4, 6],
  stage: 'M2',
 })
 assert.deepEqual(longM2.moves, ['a1a2', 'a8a7', 'b1b2'], 'M2 training sequence ends at learner move two')
 assert.deepEqual(
  trainingSequence.getOpponentMovesBeforeNextRequiredLearnerMove(longM2, 1),
  ['a8a7'],
  'M2 autoplays only the verified reply between learner moves',
 )
 assert.deepEqual(
  trainingSequence.getOpponentMovesBeforeNextRequiredLearnerMove(longM2, 2),
  [],
  'M2 never autoplays after learner move two',
 )

 const longM3 = trainingSequence.createInteractiveTrainingSequence({
  sourceSolutionLine: ['a1a2', 'a8a7', 'b1b2', 'b8b7', 'c1c2', 'c8c7', 'd1d2'],
  userMoveIndexes: [0, 2, 4, 6],
  stage: 'M3',
 })
 assert.deepEqual(longM3.moves, ['a1a2', 'a8a7', 'b1b2', 'b8b7', 'c1c2'], 'M3 ends at learner move three')
 assert.deepEqual(trainingSequence.getOpponentMovesBeforeNextRequiredLearnerMove(longM3, 1), ['a8a7'], 'M3 retains exactly one first reply')
 assert.deepEqual(trainingSequence.getOpponentMovesBeforeNextRequiredLearnerMove(longM3, 2), ['b8b7'], 'M3 retains exactly one second reply')
 assert.deepEqual(trainingSequence.getOpponentMovesBeforeNextRequiredLearnerMove(longM3, 3), [], 'M3 never autoplays after solve')

 const longM4 = trainingSequence.createInteractiveTrainingSequence({
  sourceSolutionLine: ['a1a2', 'a8a7', 'b1b2', 'b8b7', 'c1c2', 'c8c7', 'd1d2', 'd8d7', 'e1e2'],
  userMoveIndexes: [0, 2, 4, 6, 8],
  stage: 'M4',
 })
 assert.deepEqual(longM4.moves, ['a1a2', 'a8a7', 'b1b2', 'b8b7', 'c1c2', 'c8c7', 'd1d2'], 'M4 ends at learner move four')
 assert.deepEqual(trainingSequence.getOpponentMovesBeforeNextRequiredLearnerMove(longM4, 3), ['c8c7'], 'M4 retains exactly one third reply')
 assert.deepEqual(trainingSequence.getOpponentMovesBeforeNextRequiredLearnerMove(longM4, 4), [], 'M4 never autoplays after solve')

 let exercises = 0
 let longSourceLines = 0
 for (const course of index.courses.filter((course) => course.theme !== 'mixed')) {
  const directory = path.join(corpus, `${course.theme}-${course.stage.toLowerCase()}`)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
  for (const chunk of manifest.chunks) {
   const payload = JSON.parse(fs.readFileSync(path.join(directory, chunk.file), 'utf8'))
   for (const exercise of payload.exercises) {
    const sequence = trainingSequence.createInteractiveTrainingSequence({
     sourceSolutionLine: exercise.solutionLine,
     userMoveIndexes: exercise.userMoveIndexes,
     stage: exercise.stage,
    })
    const requiredLearnerMoves = Number(exercise.stage.slice(1))
    const finalLearnerMoveIndex = exercise.userMoveIndexes[requiredLearnerMoves - 1]
    assert.equal(sequence.requiredLearnerMoves, requiredLearnerMoves, `${exercise.sourcePuzzleId} stage defines learner move count`)
    assert.deepEqual(sequence.userMoveIndexes, exercise.userMoveIndexes.slice(0, requiredLearnerMoves), `${exercise.sourcePuzzleId} retains only required learner moves`)
    assert.equal(sequence.moves.length, finalLearnerMoveIndex + 1, `${exercise.sourcePuzzleId} ends on its final required learner move`)
    assert.deepEqual(
     trainingSequence.getOpponentMovesBeforeNextRequiredLearnerMove(sequence, requiredLearnerMoves),
     [],
     `${exercise.sourcePuzzleId} has no post-solve autoplay`,
    )
    if (requiredLearnerMoves > 1) {
     for (let completedLearnerMoves = 1; completedLearnerMoves < requiredLearnerMoves; completedLearnerMoves += 1) {
      assert.deepEqual(
       trainingSequence.getOpponentMovesBeforeNextRequiredLearnerMove(sequence, completedLearnerMoves),
       exercise.solutionLine.slice(exercise.userMoveIndexes[completedLearnerMoves - 1] + 1, exercise.userMoveIndexes[completedLearnerMoves]),
       `${exercise.sourcePuzzleId} uses only its verified interstitial opponent reply`,
      )
     }
    }
    if (exercise.solutionLine.length > sequence.moves.length) longSourceLines += 1
    exercises += 1
   }
  }
 }

 assert.equal(exercises, 9635, 'all approved runtime exercises were checked')
 console.log(JSON.stringify({ passed: true, exercises, longSourceLines }, null, 2))
} finally {
 await vite.close()
}
