import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const corpus = path.join(root, 'public', 'data', 'verified-lichess-tactics-v1', 'final-v6')
const index = JSON.parse(fs.readFileSync(path.join(corpus, 'index.json'), 'utf8'))
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })

try {
 const premove = await vite.ssrLoadModule('/src/trainers/patternTactic/initialPremove.ts')
 const training = await vite.ssrLoadModule('/src/trainers/patternTactic/trainingSequence.ts')
 const firstCourse = index.courses.find((course) => course.theme !== 'mixed')
 const firstManifest = JSON.parse(fs.readFileSync(path.join(corpus, `${firstCourse.theme}-${firstCourse.stage.toLowerCase()}`, 'manifest.json'), 'utf8'))
 const firstChunk = JSON.parse(fs.readFileSync(path.join(corpus, `${firstCourse.theme}-${firstCourse.stage.toLowerCase()}`, firstManifest.chunks[0].file), 'utf8'))
 const firstContext = firstChunk.exercises[0]
 assert.throws(
  () => premove.completeInitialPremove({ ...firstContext, displayedFen: firstContext.sourceFen }),
  /does not produce the displayed position/,
  'an invalid premove result fails closed rather than enabling a wrong board'
 )
 let exercises = 0
 let m1 = 0
 let m2 = 0
 let m3 = 0
 let m4 = 0

 for (const course of index.courses.filter((course) => course.theme !== 'mixed')) {
  const directory = path.join(corpus, `${course.theme}-${course.stage.toLowerCase()}`)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
  for (const chunk of manifest.chunks) {
   const payload = JSON.parse(fs.readFileSync(path.join(directory, chunk.file), 'utf8'))
   for (const exercise of payload.exercises) {
    assert.equal(exercise.provenance?.premoveContext, 'embedded-v1', `${exercise.sourcePuzzleId} carries embedded verified premove provenance`)
    assert.ok(exercise.sourceFen && exercise.displayedFen && exercise.preMove, `${exercise.sourcePuzzleId} has complete embedded premove provenance`)
    assert.equal(exercise.displayedFen, exercise.fen, `${exercise.sourcePuzzleId} embeds the displayed runtime FEN`)
    const verified = premove.verifyInitialPremove(exercise)
    assert.equal(premove.sameChessPosition(verified.displayedFen, exercise.fen), true, `${exercise.sourcePuzzleId} premove produces its displayed FEN`)
    const ready = premove.completeInitialPremove(exercise)
    assert.equal(premove.sameChessPosition(ready.boardFen, exercise.fen), true, `${exercise.sourcePuzzleId} atomic premove completion produces the displayed FEN`)
    assert.equal(ready.completedLearnerMoves, 0, `${exercise.sourcePuzzleId} premove does not complete a learner move`)
    assert.equal(ready.currentInteractiveLineIndex, 0, `${exercise.sourcePuzzleId} opens at learner decision one`)
    assert.equal(ready.awaitingOpponent, false, `${exercise.sourcePuzzleId} has no opponent reply pending after its premove`)
    assert.equal(ready.boardLocked, false, `${exercise.sourcePuzzleId} becomes interactive after a successful premove`)
    const sequence = training.createInteractiveTrainingSequence({
     sourceSolutionLine: exercise.solutionLine,
     userMoveIndexes: exercise.userMoveIndexes,
     stage: exercise.stage,
    })
    const requiredLearnerMoves = Number(exercise.stage.slice(1))
    assert.equal(sequence.requiredLearnerMoves, requiredLearnerMoves, `${exercise.sourcePuzzleId} does not count premove as a learner move`)
    assert.deepEqual(training.getOpponentMovesBeforeNextRequiredLearnerMove(sequence, requiredLearnerMoves), [], `${exercise.sourcePuzzleId} cannot autoplay after the final learner move`)
    if (requiredLearnerMoves === 1) {
     assert.deepEqual(training.getOpponentMovesBeforeNextRequiredLearnerMove(sequence, 1), [], `${exercise.sourcePuzzleId} M1 has no interactive opponent reply`)
     m1 += 1
    } else {
     for (let completedLearnerMoves = 1; completedLearnerMoves < requiredLearnerMoves; completedLearnerMoves += 1) {
      assert.equal(training.getOpponentMovesBeforeNextRequiredLearnerMove(sequence, completedLearnerMoves).length, 1, `${exercise.sourcePuzzleId} has exactly one interactive opponent reply between learner moves`)
     }
     if (requiredLearnerMoves === 2) m2 += 1
     if (requiredLearnerMoves === 3) m3 += 1
     if (requiredLearnerMoves === 4) m4 += 1
    }
    exercises += 1
   }
  }
 }

 assert.equal(exercises, 9635, 'all approved runtime exercises are premove-verified')
 const trainer = fs.readFileSync(path.join(root, 'src', 'trainers', 'patternTactic', 'PatternTacticTrainer.tsx'), 'utf8')
 assert.match(trainer, /Missing embedded verified premove provenance/, 'missing embedded premove provenance fails closed')
 assert.doesNotMatch(trainer, /premove-context\.json/, 'verified tactics do not depend on a deployable global premove sidecar')
 assert.match(trainer, /swapToPuzzlePosition\(startChess\)[\s\S]*?if \(puzzle\.preMove\)/, 'each next puzzle begins from source position then plays its one premove')
 assert.match(trainer, /completeInitialPremove\(\{[\s\S]*?setBoardLocked\(completion\.boardLocked\)/, 'the displayed premove and learner unlock use one atomic completion transition')
 assert.doesNotMatch(trainer, /preMoveTimerRef\.current = window\.setTimeout\([\s\S]*?preMoveTimerRef\.current = window\.setTimeout/, 'a nested premove unlock timer cannot leave the board locked after the premove renders')
 assert.match(trainer, /clearTimers\(\)[\s\S]*?advanceUserMoveIndex\(0\)[\s\S]*?setBoardLocked\(true\)/, 'each next puzzle clears its prior interaction state, resets learner progress, and locks before its premove')
 assert.match(trainer, /const originalPuzzleFen = game\.fen\(\)[\s\S]*?new Chess\(originalPuzzleFen\)/, 'wrong-move reset restores displayed position without replaying the initial premove')
 assert.match(trainer, /Could not start verified tactic:[\s\S]*?setPuzzles\(\[\]\)[\s\S]*?setBoardLocked\(true\)[\s\S]*?setPhase\('finished'\)/, 'a failed premove is unavailable and remains disabled instead of presenting a playable board')

 console.log(JSON.stringify({ passed: true, exercises, m1, m2, m3, m4 }, null, 2))
} finally {
 await vite.close()
}
