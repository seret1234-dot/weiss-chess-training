import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
  const { getChunkProgressDisplay } = await vite.ssrLoadModule("/src/trainers/chunkProgressDisplay.ts")

  const first = getChunkProgressDisplay({ currentPuzzleIndex: 0, totalPuzzleCount: 24, completedPuzzleCount: 0 })
  assert.deepEqual(first, {
    currentPuzzleNumber: 1,
    completedPuzzleCount: 0,
    totalPuzzleCount: 24,
    isFinalPuzzle: false,
    isComplete: false,
  }, "first puzzle uses a one-based position without completion")

  const middle = getChunkProgressDisplay({ currentPuzzleIndex: 11, totalPuzzleCount: 24, completedPuzzleCount: 11 })
  assert.equal(middle.currentPuzzleNumber, 12, "middle puzzle uses a one-based position")
  assert.equal(middle.completedPuzzleCount, 11, "middle completion count remains distinct from position")
  assert.equal(middle.isComplete, false, "middle puzzle cannot complete the chunk")

  const finalUnsolved = getChunkProgressDisplay({ currentPuzzleIndex: 23, totalPuzzleCount: 24, completedPuzzleCount: 23 })
  assert.equal(finalUnsolved.currentPuzzleNumber, 24, "final unsolved puzzle displays Puzzle 24 / 24")
  assert.equal(finalUnsolved.completedPuzzleCount, 23, "final unsolved puzzle still reports only 23 completed")
  assert.equal(finalUnsolved.isFinalPuzzle, true, "final unsolved puzzle is identified as final")
  assert.equal(finalUnsolved.isComplete, false, "final unsolved puzzle does not complete the chunk or evidence")

  const finalSolved = getChunkProgressDisplay({ currentPuzzleIndex: 23, totalPuzzleCount: 24, completedPuzzleCount: 24 })
  assert.equal(finalSolved.currentPuzzleNumber, 24, "final solved puzzle remains Puzzle 24 / 24")
  assert.equal(finalSolved.completedPuzzleCount, 24, "final solved puzzle reports 24 completed")
  assert.equal(finalSolved.isComplete, true, "only 24 completed puzzles completes the chunk")

  for (const trainerPath of [
    "src/trainers/patternMate/PatternMateTrainer.tsx",
    "src/trainers/patternTactic/PatternTacticTrainer.tsx",
  ]) {
    const source = await readFile(trainerPath, "utf8")
    assert.match(source, /getChunkProgressDisplay/, `${trainerPath} uses the shared one-based progress display`)
    assert.match(source, /Puzzle \{chunkProgressDisplay\.currentPuzzleNumber\} \/ \{chunkProgressDisplay\.totalPuzzleCount\}/, `${trainerPath} labels current puzzle position explicitly`)
    assert.match(source, /chunkProgressDisplay\.completedPuzzleCount/, `${trainerPath} renders completion separately from current position`)
    assert.match(source, /isFinalPuzzleCompletion\(/, `${trainerPath} uses the shared completed-count rule before completion handling`)
    assert.match(source, /curriculumCompletionInFlightRef/, `${trainerPath} still guards exactly-once curriculum completion`)
  }

  console.log("PASS: first, middle, final-unsolved, and final-solved learner progress displays are distinct")
  console.log("PASS: Pattern Mate and Pattern Tactic use explicit Puzzle N / total navigation with separate completed counts")
  console.log("PASS: final unsolved state cannot satisfy the completion/evidence condition")
} finally {
  await vite.close()
}
