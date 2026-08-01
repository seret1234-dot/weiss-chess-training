import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Chess } from "chess.js"
import { createServer } from "vite"

const root = process.cwd()
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
const labels = { "back-rank": "Back Rank", anastasia: "Anastasia", arabian: "Arabian", boden: "Boden", smothered: "Smothered", hook: "Hook", "kill-box": "Kill Box", dovetail: "Dovetail", "double-bishop": "Double Bishop" }
const uciMove = (game, uci) => game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined })
const lineFor = (puzzle) => Array.isArray(puzzle.solutionLine) ? puzzle.solutionLine : Array.isArray(puzzle.moves) ? puzzle.moves : Array.isArray(puzzle.solution) ? puzzle.solution : typeof puzzle.solution === "string" ? [puzzle.solution] : []

try {
  const overlay = await vite.ssrLoadModule("/src/trainers/patternMate/m2toM5LearnerCurriculum.ts")
  const selector = await vite.ssrLoadModule("/src/training/mixedSessionSelector.ts")
  const scope = await vite.ssrLoadModule("/src/training/mixedSessionScope.ts")
  const validation = await vite.ssrLoadModule("/src/trainers/patternMate/m1MateValidation.ts")
  const trainerSource = await readFile(resolve(root, "src/trainers/patternMate/PatternMateTrainer.tsx"), "utf8")
  const definitions = overlay.PATTERN_MATE_M2_TO_M5_LEARNER_CURRICULA
  assert.equal(definitions.length, 31, "all active focused M2–M5 Pattern Mate themes have learner definitions")
  assert.equal(definitions.filter((entry) => entry.mateDistance === 2).length, 9)
  assert.equal(definitions.filter((entry) => entry.mateDistance === 3).length, 9)
  assert.equal(definitions.filter((entry) => entry.mateDistance === 4).length, 7)
  assert.equal(definitions.filter((entry) => entry.mateDistance === 5).length, 6)

  const byDistance = new Map()
  for (const definition of definitions) {
    const manifest = JSON.parse(await readFile(resolve(root, `public${definition.learnerDataBasePath}/manifest.json`), "utf8"))
    assert.equal(manifest.files.length, definition.activeChunkCount, `${definition.trainerKey} exposes its intended learner chunk count`)
    assert.equal(manifest.totalChunks, definition.activeChunkCount)
    assert.equal(manifest.chunkSize, definition.activeChunkSize)
    assert.equal(manifest.totalPuzzles, definition.activeChunkCount * definition.activeChunkSize)
    assert.match(String(manifest.legacyMapping), /Deterministic contiguous source-chunk bands/)
    const canonical = new Set(); const records = []
    for (const file of manifest.files) {
      const payload = JSON.parse(await readFile(resolve(root, `public${definition.learnerDataBasePath}/${file}`), "utf8"))
      const puzzles = payload.puzzles ?? payload
      assert.equal(puzzles.length, definition.activeChunkSize, `${definition.trainerKey}/${file} loads all learner exercises`)
      const families = puzzles.map((puzzle) => puzzle.learnerCurriculum?.pedagogicalFamily ?? puzzle.pedagogicalFamily)
      for (let index = 1; index < families.length; index += 1) {
        const alternative = families.slice(index).some((family) => family !== families[index - 1])
        if (alternative) assert.notEqual(families[index], families[index - 1], "consecutive pedagogical-family repetition is avoided when alternatives exist")
      }
      for (const puzzle of puzzles) {
        assert.equal(puzzle.canonicalThemeKey, definition.theme, "canonical theme comes from source collection, not tags")
        assert.equal(puzzle.canonicalThemeLabel, labels[definition.theme])
        assert(Array.isArray(puzzle.rawTags), "raw tags are retained only as diagnostics")
        const identity = puzzle.learnerCurriculum?.canonicalIdentity
        assert(identity && !canonical.has(identity), "no canonical exercise duplicate appears within a learner curriculum")
        canonical.add(identity); records.push(puzzle)
        const game = new Chess(puzzle.fen)
        const solution = lineFor(puzzle).map((move) => String(move).toLowerCase())
        const preMove = String(puzzle.preMove ?? "").toLowerCase()
        const activeLine = preMove && solution[0] === preMove ? solution.slice(1) : solution
        if (preMove) assert(uciMove(game, preMove), "preMove remains legal")
        for (const move of activeLine) assert(uciMove(game, move), "complete stored M2–M5 solution line remains legal")
        assert(game.isCheckmate(), "complete stored M2–M5 line still ends in mate")
      }
    }
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
      item: record, theme: record.canonicalThemeKey, stableId: record.id, pedagogicalFamily: record.pedagogicalFamily,
      canonicalIdentity: record.learnerCurriculum.canonicalIdentity,
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
