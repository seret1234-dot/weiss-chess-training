import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Chess } from "chess.js"
import { createServer } from "vite"

const root = process.cwd()
const vite = await createServer({
  server: { middlewareMode: true, watch: { ignored: ["**/generated/**", "**/reports/**", "**/public/data/**", "**/.vercel-preview*/**"] } },
  appType: "custom",
})
const inventory = JSON.parse(await readFile(resolve(root, "reports/chunks/full-chunk-inventory.json"), "utf8"))
const labels = { "back-rank": "Back Rank", anastasia: "Anastasia", arabian: "Arabian", boden: "Boden", smothered: "Smothered", hook: "Hook", "kill-box-adjacent-rook": "Kill Box — Adjacent Rook", "kill-box-rook-rail": "Kill Box — Rook Rail", "kill-box-queen-fence": "Kill Box — Queen Fence", dovetail: "Dovetail", "double-bishop": "Double Bishop" }
const uciMove = (game, uci) => game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined })
const lineFor = (puzzle) => Array.isArray(puzzle.solutionLine) ? puzzle.solutionLine : Array.isArray(puzzle.moves) ? puzzle.moves : Array.isArray(puzzle.solution) ? puzzle.solution : typeof puzzle.solution === "string" ? [puzzle.solution] : []
const sourceIdentity = (puzzle) => String(puzzle?.puzzleId ?? puzzle?.lichessId ?? puzzle?.lichess_id ?? puzzle?.PuzzleId ?? puzzle?.localId ?? puzzle?.id ?? "")
const membershipHash = (ids) => createHash("sha256").update(ids.join("\n")).digest("hex")

try {
  const overlay = await vite.ssrLoadModule("/src/trainers/patternMate/m2toM5LearnerCurriculum.ts")
  const selector = await vite.ssrLoadModule("/src/training/mixedSessionSelector.ts")
  const scope = await vite.ssrLoadModule("/src/training/mixedSessionScope.ts")
  const validation = await vite.ssrLoadModule("/src/trainers/patternMate/m1MateValidation.ts")
  const trainerSource = await readFile(resolve(root, "src/trainers/patternMate/PatternMateTrainer.tsx"), "utf8")
  const definitions = overlay.PATTERN_MATE_M2_TO_M5_LEARNER_CURRICULA
  assert.equal(definitions.length, 39, "all active focused M2–M5 Pattern Mate themes have learner definitions")
  assert.equal(definitions.filter((entry) => entry.mateDistance === 2).length, 11)
  assert.equal(definitions.filter((entry) => entry.mateDistance === 3).length, 11)
  assert.equal(definitions.filter((entry) => entry.mateDistance === 4).length, 9)
  assert.equal(definitions.filter((entry) => entry.mateDistance === 5).length, 8)

  const byDistance = new Map()
  for (const definition of definitions) {
    const manifest = JSON.parse(await readFile(resolve(root, `public${definition.learnerDataBasePath}/manifest.json`), "utf8"))
    const inventoryCourse = inventory.courses.find((course) => course.family === "mates" && course.theme === definition.theme && course.distance === definition.mateDistance)
    assert.ok(inventoryCourse, `${definition.trainerKey} has an authoritative restored inventory row`)
    assert.equal(manifest.curriculumVersion, "full-precut-v1", `${definition.trainerKey} uses the restored pre-cut curriculum`)
    assert.deepEqual(manifest.files, inventoryCourse.chunkFiles, `${definition.trainerKey} preserves every historical chunk in order`)
    assert.equal(manifest.files.length, inventoryCourse.restoredChunks, `${definition.trainerKey} exposes its exact restored chunk count`)
    assert.equal(manifest.totalChunks, inventoryCourse.restoredChunks)
    assert.equal(manifest.chunkSize, 30)
    assert.equal(manifest.totalPuzzles, inventoryCourse.restoredPuzzles)
    assert.equal(definition.activeChunkCount, inventoryCourse.restoredChunks)
    assert.equal(manifest.legacyMapping, undefined, `${definition.trainerKey} does not retain reduced-overlay band metadata`)
    const canonical = new Set(); const records = []
    const orderedSourceIds = []
    for (const [fileIndex, file] of manifest.files.entries()) {
      const payload = JSON.parse(await readFile(resolve(root, `public${definition.learnerDataBasePath}/${file}`), "utf8"))
      const puzzles = payload.puzzles ?? payload
      const expectedChunk = inventoryCourse.chunkMembershipHashes[fileIndex]
      assert.equal(puzzles.length, expectedChunk.puzzleCount, `${definition.trainerKey}/${file} has its exact historical exercise count`)
      const sourceIds = puzzles.map(sourceIdentity)
      assert.equal(membershipHash(sourceIds), expectedChunk.membershipHash, `${definition.trainerKey}/${file} preserves ordered historical membership`)
      orderedSourceIds.push(...sourceIds)
      for (const [puzzleIndex, puzzle] of puzzles.entries()) {
        const identity = sourceIdentity(puzzle)
        assert(identity && !canonical.has(identity), "no canonical exercise duplicate appears within a learner curriculum")
        canonical.add(identity); records.push(puzzle)
        const solution = lineFor(puzzle).map((move) => String(move).toLowerCase())
        assert(solution.length > 0, "every restored Pattern Mate has a stored solution")
        if (puzzleIndex === 0 || puzzleIndex === Math.floor(puzzles.length / 2) || puzzleIndex === puzzles.length - 1) {
        const game = new Chess(puzzle.fen)
        const preMove = String(puzzle.preMove ?? "").toLowerCase()
        const activeLine = preMove && solution[0] === preMove ? solution.slice(1) : solution
        if (preMove) assert(uciMove(game, preMove), "preMove remains legal")
        for (const move of activeLine) assert(uciMove(game, move), "complete stored M2–M5 solution line remains legal")
        assert(game.isCheckmate(), "sampled complete stored line still ends in mate")
        }
      }
    }
    assert.equal(membershipHash(orderedSourceIds), inventoryCourse.membershipHash, `${definition.trainerKey} preserves its authoritative full-course membership hash`)
    assert.equal(canonical.size, manifest.totalPuzzles, `${definition.trainerKey} has no duplicate membership IDs`)
    assert.equal(inventoryCourse.missingIds.length, 0, `${definition.trainerKey} has no missing memberships`)
    assert.equal(inventoryCourse.extraIds.length, 0, `${definition.trainerKey} has no extra memberships`)
    for (let legacy = 0; legacy < definition.legacyChunkCount; legacy += 1) {
      const target = overlay.mapLegacyM2ToM5ChunkIndexToLearnerChunk(legacy, definition)
      assert(target >= 0 && target < definition.activeChunkCount, "every legacy chunk index resolves safely")
    }
    const meaningfulLegacyRows = Array.from({ length: definition.activeChunkCount }, (_, index) => ({
      chunk_index: Math.floor((index * definition.legacyChunkCount) / definition.activeChunkCount) + 1,
      is_mastered: true,
      mastered_puzzles_count: 30,
    }))
    assert.equal(overlay.getM2ToM5LegacyCompletionCredit(meaningfulLegacyRows, definition).complete, true, "equivalent legacy completion receives full deterministic learner credit")
    assert.equal(overlay.resolveM2ToM5LearnerFacingChunkIndex(0, definition, true), 0, "new learner starts with active chunk one")
    byDistance.set(definition.mateDistance, [...(byDistance.get(definition.mateDistance) ?? []), ...records.map((record) => ({
      item: record, theme: definition.theme, stableId: sourceIdentity(record), pedagogicalFamily: record.pedagogicalFamily,
      canonicalIdentity: sourceIdentity(record),
    }))])
  }

  for (const [distance, candidates] of byDistance) {
    const canonicalThemes = [...new Set(candidates.map((candidate) => candidate.theme))]
    const plan = selector.planMixedSession(candidates, { sessionId: `m${distance}-canonical-test`, sessionSize: 30 })
    assert(plan.orderedCandidates.every((candidate) => canonicalThemes.includes(candidate.theme)), `M${distance} mixed uses only canonical focused themes`)
    assert.equal(new Set(plan.orderedCandidates.slice(0, canonicalThemes.length).map((candidate) => candidate.theme)).size, canonicalThemes.length, `M${distance} mixed exposes all available themes before repetition`)
    for (let index = 1; index < plan.orderedCandidates.length; index += 1) assert.notEqual(plan.orderedCandidates[index].theme, plan.orderedCandidates[index - 1].theme, `M${distance} mixed avoids immediate canonical-theme repetition`)
  }
  assert.equal(scope.shouldRevealMixedTheme("identified", false), true, "identified mixed displays canonical theme before solving")
  assert.equal(scope.shouldRevealMixedTheme("blind", false), false, "blind mixed hides canonical theme before solving")
  assert.equal(scope.shouldRevealMixedTheme("blind", true), true, "blind mixed reveals canonical theme after answer or hint")
  assert.equal(validation.isPatternMateInOneTrainer("mixed-mate-2"), false, "M2 strict answer validation is unchanged")
  assert.equal(validation.isPatternMateInOneTrainer("mixed-mate-1"), true, "M1 multiple-mate handling remains isolated to M1")
  assert.match(trainerSource, /getPatternMateM2ToM5LearnerCurriculaForDistance/, "trainer loads full curated pools for mixed M2–M5")
  assert.match(trainerSource, /canonicalThemeKey: definition\.theme/, "mixed M2–M5 theme attribution uses catalog-owned canonical keys")
  console.log("PASS: all focused M2–M5 learner overlays load, validate, preserve legacy credit, and use canonical themes")
  console.log("PASS: mixed M2–M5 sessions rotate all canonical themes while preserving identified/blind disclosure and strict stored-line validation")
} finally {
  await vite.close()
}
