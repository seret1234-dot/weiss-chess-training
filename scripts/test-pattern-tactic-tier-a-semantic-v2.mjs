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
  const kingForkM3 = curriculum.getPatternTacticLearnerCurriculum("tactic-king-fork-m3")
  assert.equal(kingForkM3.activeChunkCount, 0, "King Fork M3 has no learner-facing chunks")
  assert.match(kingForkM3.unavailableReason, /Not enough semantically verified material/, "King Fork M3 presents an explicit unavailable state")
  assert.equal(curriculum.resolvePatternTacticLearnerFacingChunkIndex(49, kingForkM3), 0, "unavailable legacy routes resolve safely without v1 fallback")
  const bishopFork = curriculum.getPatternTacticLearnerCurriculum("tactic-bishop-fork-m1")
  assert.equal(bishopFork.activeChunkCount, 5, "approved Bishop Fork M1 chunk count is active")
  assert.equal(curriculum.resolvePatternTacticLearnerFacingChunkIndex(999, bishopFork), 4, "legacy chunk routes map into the semantic-v2 learner range")
  const priorKey = curriculum.getPatternTacticPriorLearnerProgressTrainerKey(bishopFork)
  const completePrior = curriculum.getPatternTacticLearnerCompletionByTrainer(Array.from({ length: 5 }, (_, index) => ({ trainer_key: priorKey, chunk_index: index + 1, is_mastered: true })))
  assert.equal(completePrior[bishopFork.trainerKey].completedActiveChunks, 5, "completed v1 learner progress receives proportional semantic-v2 credit")
  const partialLegacy = curriculum.getPatternTacticLearnerCompletionByTrainer([{ trainer_key: bishopFork.trainerKey, chunk_index: 1, is_mastered: true, mastered_puzzles_count: 30 }])
  assert.equal(partialLegacy[bishopFork.trainerKey].completedActiveChunks, 1, "legacy progress receives deterministic proportional completion credit")
} finally {
  await vite.close()
}
const trainer = fs.readFileSync(path.join(root, "src", "trainers", "patternTactic", "PatternTacticTrainer.tsx"), "utf8")
assert.match(trainer, /semantic-v2/, "trainer loads semantic-v2 mixed overlay")
assert.match(trainer, /semanticExplanation/, "trainer exposes post-answer semantic explanations")
assert.match(trainer, /semanticEvidenceSquares/, "trainer highlights only validator-proven tactical relationships after disclosure")
assert.match(trainer, /unavailableReason/, "trainer presents unavailable state without v1 fallback")
console.log("PASS: Tier A semantic-v2 overlays retain strict VALID records only, preserve approved counts, omit unavailable King Fork M3/M4, and carry verified explanation evidence")
