import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
  const progression = await vite.ssrLoadModule("/src/trainers/puzzleProgression.ts")
  const queued = new Map()
  let timerId = 0
  const controller = progression.createCorrectPuzzleAutoAdvanceController({
    setTimeout(callback, delayMs) {
      const id = ++timerId
      queued.set(id, { callback, delayMs })
      return id
    },
    clearTimeout(id) {
      queued.delete(id)
    },
  })

  let advances = 0
  controller.schedule(() => { advances += 1 })
  assert.equal([...queued.values()][0].delayMs, progression.CORRECT_PUZZLE_AUTO_ADVANCE_MS, "correct answers wait about one second")
  assert.equal(advances, 0, "correct success state remains visible before auto-advance")
  const [firstTimerId, firstTimer] = [...queued.entries()][0]
  queued.delete(firstTimerId)
  firstTimer.callback()
  assert.equal(advances, 1, "a non-final correct answer advances once after the delay")
  firstTimer.callback()
  assert.equal(advances, 1, "a rerendered/stale timer cannot advance twice")

  controller.schedule(() => { advances += 1 })
  controller.cancel()
  assert.equal(queued.size, 0, "manual Next Puzzle/navigation cancels pending auto-advance")
  assert.equal(advances, 1, "cancelled progression does not advance")

  assert.equal(progression.isFinalPuzzleCompletion({ currentPuzzleIndex: 23, totalPuzzleCount: 24, completedPuzzleCount: 23 }), false, "final unsolved puzzle cannot complete or write evidence")
  assert.equal(progression.isFinalPuzzleCompletion({ currentPuzzleIndex: 23, totalPuzzleCount: 24, completedPuzzleCount: 24 }), true, "final solved puzzle transitions to completion instead of another puzzle")

  for (const trainerPath of [
    "src/trainers/patternMate/PatternMateTrainer.tsx",
    "src/trainers/patternTactic/PatternTacticTrainer.tsx",
  ]) {
    const source = await readFile(trainerPath, "utf8")
    assert.match(source, /useCorrectPuzzleAutoAdvance/, `${trainerPath} uses the shared owned auto-advance timer`)
    assert.match(source, /const nextChunkProgress = chunkProgressRef\.current/, `${trainerPath} reads current progress at final transition, not stale render state`)
    assert.match(source, /scheduleCorrectAutoAdvance\(goToNextPuzzle\)/, `${trainerPath} delays correct-answer transition through the shared helper`)
    assert.match(source, /setPhase\('solving'\)[\s\S]*?try again/, `${trainerPath} keeps wrong answers interactive`)
    assert.doesNotMatch(source, /setHintMoveUci\(expectedUci\)/, `${trainerPath} never turns a wrong move into an automatic solution arrow`)
    assert.doesNotMatch(source, /AUTO_NEXT_DELAY_MS/, `${trainerPath} has no independent legacy correct-answer timer`)
  }

  const mateSource = await readFile("src/trainers/patternMate/PatternMateTrainer.tsx", "utf8")
  assert.match(mateSource, /onHintStage=\{[\s\S]*?setHintMoveUci\(stage === ['"]square['"]/, "Pattern Mate adds destination guidance only through its explicit second Hint")

  const tacticSource = await readFile("src/trainers/patternTactic/PatternTacticTrainer.tsx", "utf8")
  assert.match(tacticSource, /onHintStage=\{[\s\S]*?setHintLevel\(stage\)/, "Pattern Tactic advances hint level only through the explicit Hint control")
  assert.match(tacticSource, /onHintStage=\{[\s\S]*?setHintMoveUci\(stage === ['"]square['"]/, "Pattern Tactic adds destination guidance only through the explicit second Hint")

  const tacticTrainer = await readFile("src/trainers/patternTactic/PatternTacticTrainer.tsx", "utf8")
  assert.doesNotMatch(tacticTrainer, /scheduleSemanticAutoAdvance/, "semantic wrong answers no longer schedule terminal auto-advance")
  assert.doesNotMatch(tacticTrainer, /semanticCountdownSeconds/, "semantic tactics no longer use the five/seven-second terminal countdown")
  console.log("PASS: correct answers use one cancellable one-second transition; stale callbacks cannot double-advance")
  console.log("PASS: wrong answers and progressive hints remain interactive, while final completion requires N of N progress")
} finally {
  await vite.close()
}
