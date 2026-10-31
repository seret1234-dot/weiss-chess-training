import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" })
try {
  const catalog = await vite.ssrLoadModule("/src/training/curriculum/curriculumCatalog.ts")
  const events = await vite.ssrLoadModule("/src/training/curriculum/curriculumEvents.ts")
  const selector = await vite.ssrLoadModule("/src/training/curriculum/selectCurriculumItem.ts")
  const taxonomy = await vite.ssrLoadModule("/src/trainers/patternTactic/generatedFinalVerifiedTaxonomy.ts")

  const twoChunkCourses = taxonomy.VERIFIED_FINAL_TACTIC_COURSES.filter((course) => course.chunkCount === 2)
  assert.deepEqual(twoChunkCourses.map((course) => course.trainerKey).sort(), [
    "tactic-bishop-fork-m2", "tactic-discovered-check-m4", "tactic-king-fork-m4", "tactic-rank-clearance-m2",
  ], "only the four approved final-v6 courses use the two-chunk requirement")
  for (const course of taxonomy.VERIFIED_FINAL_TACTIC_COURSES) {
    assert.equal(catalog.getFocusedChunkMasteryRequirement({ area: "tactics", trainerKey: course.trainerKey }), Math.min(3, course.chunkCount), `${course.trainerKey} follows min(3, verified chunks)`)
  }

  const perfect = (learnerChunk, key = `chunk-${learnerChunk}`) => ({
    userId: "account-a", idempotencyKey: key, area: "tactics", stageOrder: 1,
    themeKey: "bishop-fork", trainerKey: "tactic-bishop-fork-m1", route: "/tactics/m1/bishop-fork",
    eventKind: "focused", learnerChunk, attempts: 30, correctAttempts: 30, hintCount: 0,
  })
  const repeated = [perfect(1, "one"), perfect(1, "repeat")]
  assert.deepEqual(events.distinctPerfectFocusedChunkIndices(repeated), [1], "a repeated chunk never earns duplicate credit")
  assert.equal(events.hasRequiredDistinctPerfectChunks(repeated, 3), false, "one distinct chunk cannot master a three-chunk course")
  assert.equal(events.hasRequiredDistinctPerfectChunks([perfect(1), perfect(2), perfect(3)], 3), true, "three distinct perfect chunks master a normal course")
  assert.equal(events.hasRequiredDistinctPerfectChunks([perfect(1), perfect(2)], 2), true, "both distinct chunks master an approved two-chunk course")
  assert.equal(events.hasRequiredDistinctPerfectChunks([{ ...perfect(2), eventKind: "review" }], 1), false, "reviews do not create initial-mastery credit")

  const stateFor = (perfectChunkIndices = [], mastered = false) => ({
    rating: 600,
    themeMastery: { tactics: { "1:bishop-fork": { perfectChunkIndices, requiredPerfectChunks: 3, mastered } } },
  })
  const first = selector.selectCurriculumItem({ state: stateFor(), area: "tactics", selectionIndex: 0, depthSelectionIndex: 0, tacticThemeSelectionIndices: { 1: 0 } })
  const second = selector.selectCurriculumItem({ state: stateFor([1]), area: "tactics", selectionIndex: 99, depthSelectionIndex: 0, tacticThemeSelectionIndices: { 1: 99 } })
  const third = selector.selectCurriculumItem({ state: stateFor([1, 2]), area: "tactics", selectionIndex: 99, depthSelectionIndex: 0, tacticThemeSelectionIndices: { 1: 99 } })
  assert.equal(first?.theme, "bishop-fork")
  assert.equal(first?.chunkIndex, 0, "focused practice starts at the first uncredited chunk")
  assert.equal(second?.theme, "bishop-fork")
  assert.equal(second?.chunkIndex, 1, "the next Auto decision keeps the active theme on Chunk 2")
  assert.equal(third?.theme, "bishop-fork")
  assert.equal(third?.chunkIndex, 2, "the active theme keeps its three-chunk sequence despite a different global ordinal")
  const runtimeSource = await readFile(new URL("../src/training/curriculum/curriculumRuntime.ts", import.meta.url), "utf8")
  assert.match(runtimeSource, /chunkIndex: recommendation\.chunkIndex \?\? \(m2ToM5Learner/, "runtime keeps an explicit focused chunk instead of overwriting it with the global ordinal")

  console.log("PASS: authoritative final-v6 two-chunk exception and distinct-focused mastery sequence")
} finally {
  await vite.close()
}
