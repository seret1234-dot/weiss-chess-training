import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
  const progression = await vite.ssrLoadModule("/src/trainers/puzzleProgression.ts")
  const { preparePuzzleStartPosition } = await vite.ssrLoadModule('/src/trainers/puzzleStartPosition.ts')
  const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const source = { fen: initialFen, preMove: 'e2e4' }
  const prepared = preparePuzzleStartPosition(source)
  assert.equal(prepared.get('e4')?.type, 'p')
  assert.equal(prepared.turn(), 'b', 'orientation comes from the prepared learner position')
  assert.equal(source.fen, initialFen, 'source records are never mutated')
  assert.equal(preparePuzzleStartPosition({ fen: prepared.fen() }).fen(), prepared.fen(), 'Master records without a premove are already ready')
  assert.equal(preparePuzzleStartPosition({ ...source, sourceFen: initialFen, displayedFen: prepared.fen() }).fen(), prepared.fen(), 'verified setup is prepared using the existing validation contract')
  assert.throws(() => preparePuzzleStartPosition({ ...source, preMove: 'e2e5' }), 'illegal setup fails closed before any board is published')
  assert.throws(() => preparePuzzleStartPosition({ ...source, sourceFen: initialFen, displayedFen: '8/8/8/8/8/8/4K3/7k w - - 0 1' }), 'mismatched verified evidence fails closed')
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
  assert.equal(progression.CORRECT_PUZZLE_AUTO_ADVANCE_MS, 2000)
  assert.equal(progression.WRONG_MOVE_RESET_MS, 2000, "error readability does not extend board locking")
  assert.equal(progression.WRONG_MOVE_FEEDBACK, "Wrong move — try again.")
  assert.equal(progression.SILENT_ERROR_FEEDBACK, "Wrong, silent error")
  assert.equal([...queued.values()][0].delayMs, 2000, "correct feedback waits two seconds")
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

  const wrongResetController = progression.createWrongMoveResetController({
    setTimeout(callback, delayMs) {
      const id = ++timerId
      queued.set(id, { callback, delayMs })
      return id
    },
    clearTimeout(id) {
      queued.delete(id)
    },
  })
  let boardPosition = "wrong-position"
  let boardLocked = true
  wrongResetController.schedule(() => {
    boardPosition = "original-position"
    boardLocked = false
  })
  assert.equal([...queued.values()][0].delayMs, progression.WRONG_MOVE_RESET_MS, "a legal wrong move remains visible for two seconds")
  assert.equal(boardPosition, "wrong-position", "the legal wrong move does not snap back immediately")
  assert.equal(boardLocked, true, "the board is locked during the visible wrong-move state")
  const [wrongResetTimerId, wrongResetTimer] = [...queued.entries()][0]
  queued.delete(wrongResetTimerId)
  wrongResetTimer.callback()
  assert.equal(boardPosition, "original-position", "the exact original puzzle position returns after the delay")
  assert.equal(boardLocked, false, "the board becomes interactive after the wrong-move reset")

  boardPosition = "later-puzzle"
  wrongResetController.schedule(() => { boardPosition = "stale-original-position" })
  const [staleTimerId, staleTimer] = [...queued.entries()][0]
  wrongResetController.cancel()
  queued.delete(staleTimerId)
  staleTimer.callback()
  assert.equal(boardPosition, "later-puzzle", "a cancelled wrong-move timer cannot affect a later puzzle")

  assert.equal(progression.isFinalPuzzleCompletion({ currentPuzzleIndex: 23, totalPuzzleCount: 24, completedPuzzleCount: 23 }), false, "final unsolved puzzle cannot complete or write evidence")
  assert.equal(progression.isFinalPuzzleCompletion({ currentPuzzleIndex: 23, totalPuzzleCount: 24, completedPuzzleCount: 24 }), true, "final solved puzzle transitions to completion instead of another puzzle")

  for (const trainerPath of [
    "src/trainers/patternMate/PatternMateTrainer.tsx",
    "src/trainers/patternTactic/PatternTacticTrainer.tsx",
  ]) {
    const source = await readFile(trainerPath, "utf8")
    assert.match(source, /useCorrectPuzzleAutoAdvance/, `${trainerPath} uses the shared owned auto-advance timer`)
    assert.match(source, /useWrongMoveReset/, `${trainerPath} uses the shared owned wrong-move reset timer`)
    assert.match(source, /const nextChunkProgress = chunkProgressRef\.current/, `${trainerPath} reads current progress at final transition, not stale render state`)
    assert.match(source, /scheduleCorrectAutoAdvance\(goToNextPuzzle\)/, `${trainerPath} uses the shared two-second feedback duration`)
    assert.match(source, /loadPuzzleImmediate\(nextPuzzle, i, undefined, undefined, undefined, true\)/, `${trainerPath} advances directly to a prepared learner position`)
    assert.doesNotMatch(source, /puzzleBoardVersion/, `${trainerPath} preserves the mounted board between puzzles`)
    assert.match(source, /puzzleLearnerSideRef\.current = userTurn/, `${trainerPath} remembers the ready puzzle learner side`)
    assert.match(source, /setDisplayTurn\(puzzleLearnerSideRef\.current\)/, `${trainerPath} keeps learner side on completion`)
    assert.doesNotMatch(source, /setDisplayTurn\(solvedGame\.turn\(\)\)/, `${trainerPath} never displays the post-solve opponent turn`)
    assert.equal(source.match(/setMessage\(\s*'Correct'\s*\)/g)?.length, 1, 'qualifying success keeps exactly Correct')
    assert.match(source, /setMessage\(\s*puzzleSuccessFeedback\(perfectionTrackerRef.current.snapshot\(\)\)\s*\)/, 'non-qualifying success uses the timing-aware presentation helper without changing progression')
    assert.doesNotMatch(source, /setMessage\(\s*[`'"][^\n]*(?:perfect solve|perfect credit)/, 'normal feedback does not expose mastery-accounting terms')
    assert.doesNotMatch(source, /this solve will not count toward mastery|Wrong piece —|Wrong destination —/, 'errors avoid internal mastery wording')
    assert.match(source, /setGameAndBoardFen\(testGame\)[\s\S]*?setBoardLocked\(true\)[\s\S]*?scheduleWrongMoveReset/, `${trainerPath} renders and locks a legal wrong move before scheduling its reset`)
    // Mouse and clear illegal speech now share the extracted wrong-answer path.
    assert.match(source, /const originalPuzzleFen = game\.fen\(\)[\s\S]*?return registerIncorrectAnswer\(originalPuzzleFen, expectedUci, \{ position: testGame/, `${trainerPath} sends the unchanged original FEN and legal wrong move to the shared handler`)
    const wrongHandler = source.slice(source.indexOf(' function registerIncorrectAnswer('), source.indexOf(' function attemptUserMove('))
    assert.match(wrongHandler, /markSubmittedWrongMove\(\)[\s\S]*?suspendLearnerPosition\(\)/, `${trainerPath} records wrong-answer evidence in one shared path`)
    assert.match(wrongHandler, /scheduleWrongMoveReset\([\s\S]*?new Chess\(originalPuzzleFen\)[\s\S]*?setGameAndBoardFen\(restoredGame\)[\s\S]*?setBoardLocked\(false\)/, `${trainerPath} restores the original position and unlocks after the wrong-move delay`)
    assert.match(source, /cancelWrongMoveReset\(\)/, `${trainerPath} cancels stale wrong-move resets during navigation/restart cleanup`)
    assert.match(source, /hintResetKey=\{`\$\{currentPuzzle\?\.id \?\? ''\}:\$\{currentUserMoveIndexRef\.current\}`\}/, `${trainerPath} does not reset the explicit hint level merely because the temporary wrong board is rendered`)
    assert.doesNotMatch(source, /setHintMoveUci\(expectedUci\)/, `${trainerPath} never turns a wrong move into an automatic solution arrow`)
    assert.doesNotMatch(source, /AUTO_NEXT_DELAY_MS/, `${trainerPath} has no independent legacy correct-answer timer`)
  }

  const mateSource = await readFile("src/trainers/patternMate/PatternMateTrainer.tsx", "utf8")
  assert.match(mateSource, /onHintStage=\{[\s\S]*?setHintMoveUci\(stage === ['"]square['"]/, "Pattern Mate adds destination guidance only through its explicit second Hint")

  const tacticSource = await readFile("src/trainers/patternTactic/PatternTacticTrainer.tsx", "utf8")
  assert.match(tacticSource, /onHintStage=\{[\s\S]*?setHintMoveUci\(stage === ['"]square['"]/, "Pattern Tactic keeps progressive board guidance behind the explicit Hint control")
  assert.match(tacticSource, /onHintStage=\{[\s\S]*?setHintMoveUci\(stage === ['"]square['"]/, "Pattern Tactic adds destination guidance only through the explicit second Hint")

  const tacticTrainer = await readFile("src/trainers/patternTactic/PatternTacticTrainer.tsx", "utf8")
  assert.match(tacticTrainer, /scheduleCorrectAutoAdvance\(goToNextPuzzle\)/, "Pattern Tactic uses the same two-second correct-feedback duration as Mates")
  assert.doesNotMatch(tacticTrainer, /getSemanticDisclosurePresentation|Show Solution|semanticEvidenceSquares/, "verified tactics use the existing Production presentation state machine without semantic teaching UI")
  assert.match(tacticTrainer, /return registerIncorrectAnswer\(originalPuzzleFen, expectedUci, \{ position: testGame, uci: playedUci, san: move.san \}, options\?\.allowWrongMoveToShow\)/, 'Pattern Tactic passes the unchanged mouse display option to the extracted handler')
  assert.match(tacticTrainer, /if \(!wrongMove \|\| allowWrongMoveToShow\)[\s\S]*?scheduleWrongMoveReset\([\s\S]*?\)[\s\S]*?return true[\s\S]*?scheduleWrongMoveReset\([\s\S]*?, 700\)/, "Pattern Tactic retains Production's visible drag wrong-move reset and short click/tap recovery paths")
  assert.doesNotMatch(tacticTrainer, /scheduleSemanticAutoAdvance/, "semantic wrong answers no longer schedule terminal auto-advance")
  assert.doesNotMatch(tacticTrainer, /semanticCountdownSeconds/, "semantic tactics no longer use the five/seven-second terminal countdown")
  console.log("PASS: correct answers use one cancellable transition; stale callbacks cannot double-advance")
  console.log("PASS: legal wrong moves remain visible for two seconds, then restore safely without automatic hints")
  console.log("PASS: progressive hints remain explicit, while final completion requires N of N progress")
} finally {
  await vite.close()
}
