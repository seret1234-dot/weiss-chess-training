import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { validateTacticRecord } from "./lib/pattern-tactic-semantic-validator.mjs"
import { createServer } from "vite"

const root = process.cwd()
const dataRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const counts = JSON.parse(fs.readFileSync(path.join(root, "docs", "reviews", "pattern-tactic-tier-a-semantic-v2-counts.json"), "utf8"))
const list = (value) => Array.isArray(value) ? value : value?.puzzles ?? []
for (const entry of counts) {
  const directory = path.join(dataRoot, `${entry.theme}-m${entry.stage}-semantic-v2`)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"))
  assert.equal(Boolean(manifest.unavailable), entry.unavailable, `${entry.theme} M${entry.stage} availability matches plan`)
  assert.equal(manifest.totalChunks, entry.chunks, `${entry.theme} M${entry.stage} approved chunk count`)
  assert.equal(manifest.totalPuzzles, entry.retained, `${entry.theme} M${entry.stage} approved retained count`)
  if (entry.unavailable) { assert.equal(manifest.files.length, 0); continue }
  const canonical = new Set()
  for (const file of manifest.files) for (const puzzle of list(JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")))) {
    const verdict = validateTacticRecord(puzzle, entry.theme)
    assert.equal(verdict.status, "VALID", `${entry.theme} M${entry.stage} retains only strict VALID records`)
    assert.equal(puzzle.semanticAudit?.status, "VALID", "serialized audit status is strict VALID")
    assert.ok(puzzle.semanticAudit?.evidence, "semantic evidence is serialized for post-answer explanation")
    assert.equal(canonical.has(puzzle.learnerCurriculum?.canonicalIdentity), false, "no duplicate canonical exercise")
    canonical.add(puzzle.learnerCurriculum?.canonicalIdentity)
  }
}
for (const stage of [1, 2, 3, 4]) {
  const mixed = JSON.parse(fs.readFileSync(path.join(dataRoot, `mixed-m${stage}-semantic-v2`, "manifest.json"), "utf8"))
  assert.equal(mixed.sourceThemes.includes("king-fork") && stage >= 3, false, `mixed M${stage} omits unavailable King Fork`)
}
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
try {
  const curriculum = await vite.ssrLoadModule("/src/trainers/patternTactic/m1toM4LearnerCurriculum.ts")
  const disclosureRuntime = await vite.ssrLoadModule("/src/trainers/patternTactic/semanticDisclosure.ts")
  const kingForkM3 = curriculum.getPatternTacticLearnerCurriculum("tactic-king-fork-m3")
  assert.equal(kingForkM3.activeChunkCount, 0, "King Fork M3 has no learner-facing chunks")
  assert.equal(kingForkM3.unavailableReason, "Not enough reviewed material is available for this course yet.", "King Fork M3 presents the catalog-wide explicit unavailable state")
  assert.equal(curriculum.resolvePatternTacticLearnerFacingChunkIndex(49, kingForkM3), 0, "unavailable legacy routes resolve safely without v1 fallback")
  const bishopFork = curriculum.getPatternTacticLearnerCurriculum("tactic-bishop-fork-m1")
  assert.equal(bishopFork.activeChunkCount, 3, "sound Bishop Fork M1 chunk count is active")
  assert.equal(curriculum.resolvePatternTacticLearnerFacingChunkIndex(999, bishopFork), 2, "legacy chunk routes map into the semantic-v3 learner range")
  const priorKey = curriculum.getPatternTacticPriorLearnerProgressTrainerKey(bishopFork)
  const completePrior = curriculum.getPatternTacticLearnerCompletionByTrainer(Array.from({ length: 5 }, (_, index) => ({ trainer_key: priorKey, chunk_index: index + 1, is_mastered: true })))
  assert.equal(completePrior[bishopFork.trainerKey].completedActiveChunks, 3, "completed semantic-v2 learner progress receives proportional semantic-v3 credit")
  const partialLegacy = curriculum.getPatternTacticLearnerCompletionByTrainer([{ trainer_key: bishopFork.trainerKey, chunk_index: 1, is_mastered: true, mastered_puzzles_count: 30 }])
  assert.equal(partialLegacy[bishopFork.trainerKey].completedActiveChunks, 1, "legacy progress receives deterministic proportional completion credit")

  let disclosure = disclosureRuntime.nextSemanticDisclosureState(false, "reveal")
  assert.equal(disclosure, true, "a correct answer, wrong attempt, hint, or solution reveal discloses semantic evidence")
  disclosure = disclosureRuntime.nextSemanticDisclosureState(disclosure, "timer")
  assert.equal(disclosure, true, "semantic disclosure remains visible while its disclosure timer runs")
  const retainedPresentation = disclosureRuntime.getSemanticDisclosurePresentation("Verified fork", ["d4", "g1", "c5"], disclosure)
  assert.equal(retainedPresentation.visible, true, "semantic explanation remains visible until navigation")
  assert.deepEqual(retainedPresentation.squares.sort(), ["c5", "d4", "g1"], "verified relationship highlights remain with the explanation")
  const blindBeforeAnswer = disclosureRuntime.getSemanticDisclosurePresentation("Verified fork", ["d4", "g1", "c5"], false)
  assert.equal(blindBeforeAnswer.visible, false, "blind mixed mode does not leak semantic evidence before an answer or hint")
  assert.deepEqual(blindBeforeAnswer.squares, [], "blind mixed mode has no pre-answer semantic highlights")
  disclosure = disclosureRuntime.nextSemanticDisclosureState(disclosure, "next-puzzle")
  assert.equal(disclosure, false, "Next Puzzle clears semantic disclosure")
  assert.equal(disclosureRuntime.getSemanticDisclosurePresentation("Verified fork", ["d4", "g1", "c5"], disclosure).visible, false, "Next Puzzle clears explanation and highlights together")
  assert.equal(disclosureRuntime.nextSemanticDisclosureState(true, "restart"), false, "Restart progression clears semantic disclosure")

  const correctCountdown = disclosureRuntime.createSemanticDisclosureCountdown("correct", 0)
  assert.equal(disclosureRuntime.getSemanticDisclosureCountdownSeconds(correctCountdown, 0), 5, "correct semantic disclosure starts a visible five-second countdown")
  assert.equal(disclosureRuntime.getSemanticDisclosureCountdownRemainingMs(correctCountdown, 5_000), 0, "correct semantic disclosure advances after five active seconds")
  const pausedCorrect = disclosureRuntime.pauseSemanticDisclosureCountdown(correctCountdown, 2_000)
  assert.equal(disclosureRuntime.getSemanticDisclosureCountdownRemainingMs(pausedCorrect, 20_000), 3_000, "hover, keyboard focus, or tab hiding pauses the remaining correct-answer countdown")
  const resumedCorrect = disclosureRuntime.resumeSemanticDisclosureCountdown(pausedCorrect, 20_000)
  assert.equal(disclosureRuntime.getSemanticDisclosureCountdownRemainingMs(resumedCorrect, 23_000), 0, "the correct-answer countdown resumes from its remaining duration")
  const assistedCountdown = disclosureRuntime.createSemanticDisclosureCountdown("assisted", 0)
  assert.equal(disclosureRuntime.getSemanticDisclosureCountdownSeconds(assistedCountdown, 0), 7, "wrong answers and solution reveals start a seven-second countdown")
  assert.equal(disclosureRuntime.getSemanticDisclosureCountdownRemainingMs(assistedCountdown, 7_000), 0, "assisted semantic disclosure advances after seven active seconds")

  const firstHint = disclosureRuntime.getSemanticDisclosureTriggerState("hint-preview")
  assert.equal(firstHint.terminal, false, "the first piece hint is an interactive preview, not terminal disclosure")
  assert.equal(firstHint.autoAdvanceOutcome, null, "the first hint does not start an auto-advance countdown")
  const secondHint = disclosureRuntime.getSemanticDisclosureTriggerState("hint-preview")
  assert.equal(secondHint.terminal, false, "the second destination hint remains interactive and does not complete the puzzle")
  assert.equal(secondHint.autoAdvanceOutcome, null, "intermediate hints do not write terminal timing state")
  const solutionDisclosure = disclosureRuntime.getSemanticDisclosureTriggerState("solution")
  assert.equal(solutionDisclosure.terminal, true, "Show Solution is a terminal disclosure")
  assert.equal(solutionDisclosure.autoAdvanceOutcome, "assisted", "Show Solution starts the seven-second assisted countdown")
  assert.equal(disclosureRuntime.getSemanticDisclosureTriggerState("correct").autoAdvanceOutcome, "correct", "a correct answer retains the five-second countdown")
} finally {
  await vite.close()
}
const trainer = fs.readFileSync(path.join(root, "src", "trainers", "patternTactic", "PatternTacticTrainer.tsx"), "utf8")
assert.match(trainer, /semantic-v4/, "trainer loads the fail-closed semantic-v4 mixed overlay")
assert.match(trainer, /semanticExplanation/, "trainer exposes post-answer semantic explanations")
assert.match(trainer, /semanticEvidenceSquares/, "trainer highlights only validator-proven tactical relationships after disclosure")
assert.match(trainer, /semanticDisclosureRevealed/, "trainer keeps semantic disclosure independently of transient feedback state")
assert.match(trainer, /getSemanticDisclosureTriggerState\('correct'\)/, "correct Tier A answers schedule a five-second auto-advance")
assert.match(trainer, /getSemanticDisclosureTriggerState\('wrong'\)/, "terminal wrong answers schedule a seven-second auto-advance")
assert.match(trainer, /getSemanticDisclosureTriggerState\('solution'\)/, "Show Solution schedules a seven-second auto-advance")
assert.match(trainer, /onPointerEnter=\{\(\) => setSemanticHover\(true\)\}/, "hovering the explanation pauses the auto-advance countdown")
assert.match(trainer, /visibilitychange/, "hidden browser tabs pause the auto-advance countdown")
assert.match(trainer, /clearSemanticAutoAdvance\(\)/, "manual Next Puzzle, puzzle changes, restart, and unmount clear the auto-advance timer")
assert.match(trainer, /aria-live="polite"/, "semantic explanation is announced accessibly when revealed")
assert.match(trainer, /unavailableReason/, "trainer presents unavailable state without v1 fallback")
const hintHandler = trainer.match(/onHintStage=\{\(move, stage\) => \{[\s\S]*?\n \}\}\n onHintReset=/)?.[0] ?? ""
assert.match(hintHandler, /setHintLevel\(stage\)/, "the progressive hint level is tracked independently from terminal disclosure")
assert.doesNotMatch(hintHandler, /revealSemanticDisclosure\(\)/, "intermediate hints do not reveal terminal semantic disclosure")
assert.doesNotMatch(hintHandler, /scheduleSemanticAutoAdvance/, "intermediate hints do not start the countdown")
assert.doesNotMatch(hintHandler, /setBoardLocked\(true\)/, "intermediate hints leave the board interactive")
assert.doesNotMatch(hintHandler, /reportTrainingItemCompleted|incrementFastSolve|updateCategoryStats/, "intermediate hints do not record puzzle completion or progress")
assert.match(trainer, /function revealStoredSolution\(\)/, "a separate terminal Show Solution path exists")
assert.match(trainer, /Show Solution/, "the final solution reveal remains explicitly available after progressive hints")
console.log("PASS: Tier A semantic-v2 overlays retain strict VALID records only, preserve approved counts, omit unavailable King Fork M3/M4, and carry verified explanation evidence")
