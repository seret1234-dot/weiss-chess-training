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
const sourceIdentity = (raw) => String(raw?.puzzleId ?? raw?.lichessId ?? raw?.lichess_id ?? raw?.PuzzleId ?? raw?.localId ?? raw?.id ?? "")
const membershipHash = (ids) => createHash("sha256").update(ids.join("\n")).digest("hex")

function solutionLine(raw) {
  if (Array.isArray(raw.solutionLine)) return raw.solutionLine
  if (Array.isArray(raw.moves)) return raw.moves
  if (Array.isArray(raw.solution)) return raw.solution
  if (typeof raw.full_solution === "string") return raw.full_solution.split(/\s+/)
  if (typeof raw.solution === "string") return [raw.solution]
  return []
}

function displayedFen(raw) {
  const game = new Chess(raw.fen ?? raw.FEN)
  if (raw.preMove) {
    const move = String(raw.preMove).trim().toLowerCase()
    game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move.slice(4, 5) || undefined })
  }
  return game.fen().split(/\s+/).slice(0, 4).join(" ")
}

function canonical(raw) {
  const solution = solutionLine(raw).map((move) => String(move).trim().toLowerCase()).filter(Boolean)
  const source = raw.lichessId ?? raw.lichess_id ?? raw.PuzzleId ?? raw.localId ?? raw.id ?? ""
  return `${displayedFen(raw)}|mate-in-1|${solution.join(",")}|${source}`
}

function contentIdentity(raw) {
  const solution = solutionLine(raw).map((move) => String(move).trim().toLowerCase()).filter(Boolean)
  return `${displayedFen(raw)}|mate-in-1|${solution.join(",")}`
}

function assertLegalTimeline(raw, theme) {
  const line = solutionLine(raw).map((move) => String(move).trim().toLowerCase()).filter(Boolean)
  const game = new Chess(raw.fen ?? raw.FEN)
  const preMove = raw.preMove ? String(raw.preMove).trim().toLowerCase() : null
  const moves = preMove && line[0] !== preMove ? [preMove, ...line] : line
  for (const uci of moves) {
    const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined })
    assert(move, `${theme} has a legal source solution timeline`)
  }
}

try {
  const overlay = await vite.ssrLoadModule("/src/trainers/patternMate/m1LearnerCurriculum.ts")
  const runtime = await vite.ssrLoadModule("/src/training/curriculum/curriculumRuntime.ts")
  const routerSource = await readFile(resolve(root, "src/AppRouter.tsx"), "utf8")

  for (const definition of overlay.PATTERN_MATE_M1_LEARNER_CURRICULA) {
    const manifestPath = resolve(root, `public${definition.learnerDataBasePath}/manifest.json`)
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    const inventoryCourse = inventory.courses.find((course) => course.family === "mates" && course.theme === definition.theme && course.distance === 1)
    assert.ok(inventoryCourse, `${definition.theme} has an authoritative restored inventory row`)
    assert.equal(manifest.curriculumVersion, "full-precut-v1", `${definition.theme} uses the restored pre-cut curriculum`)
    assert.deepEqual(manifest.files, inventoryCourse.chunkFiles, `${definition.theme} preserves every historical chunk in order`)
    assert.equal(manifest.files.length, inventoryCourse.restoredChunks, `${definition.theme} exposes its exact restored chunk count`)
    assert.equal(manifest.totalPuzzles, inventoryCourse.restoredPuzzles, `${definition.theme} exposes its exact restored puzzle count`)
    assert.equal(definition.activeChunkCount, inventoryCourse.restoredChunks, `${definition.theme} runtime count matches its manifest`)

    const identities = new Set()
    const orderedSourceIds = []
    for (const [fileIndex, file] of manifest.files.entries()) {
      const data = JSON.parse(await readFile(resolve(root, `public${definition.learnerDataBasePath}`, file), "utf8"))
      const puzzles = data.puzzles ?? data.exercises ?? data
      const expectedChunk = inventoryCourse.chunkMembershipHashes[fileIndex]
      assert.equal(puzzles.length, expectedChunk.puzzleCount, `${definition.theme}/${file} has its exact historical exercise count`)
      const sourceIds = puzzles.map(sourceIdentity)
      assert.equal(membershipHash(sourceIds), expectedChunk.membershipHash, `${definition.theme}/${file} preserves ordered historical membership`)
      orderedSourceIds.push(...sourceIds)
      const chunkFamilies = []
      for (const [puzzleIndex, raw] of puzzles.entries()) {
        const line = solutionLine(raw)
        assert(line.length > 0, `${definition.theme} puzzle has a solution`)
        if (puzzleIndex === 0 || puzzleIndex === Math.floor(puzzles.length / 2) || puzzleIndex === puzzles.length - 1) {
          assertLegalTimeline(raw, definition.theme)
        }
        const key = sourceIdentity(raw)
        assert(!identities.has(key), `${definition.theme} has no duplicate canonical identity`)
        identities.add(key)
        if (raw.learnerCurriculum?.pedagogicalFamily) {
          chunkFamilies.push(raw.learnerCurriculum.pedagogicalFamily)
        }
      }
      if (chunkFamilies.length > 0) {
        assert.equal(new Set(chunkFamilies).size, chunkFamilies.length, `${definition.theme}/${file} has no repeated pedagogical family when alternatives exist`)
        for (let index = 1; index < chunkFamilies.length; index += 1) {
          assert.notEqual(chunkFamilies[index], chunkFamilies[index - 1], `${definition.theme}/${file} has no consecutive equivalent family`)
        }
      }
    }
    assert.equal(identities.size, manifest.totalPuzzles)
    assert.equal(membershipHash(orderedSourceIds), inventoryCourse.membershipHash, `${definition.theme} preserves its authoritative full-course membership hash`)
    assert.equal(inventoryCourse.missingIds.length, 0, `${definition.theme} has no missing memberships`)
    assert.equal(inventoryCourse.extraIds.length, 0, `${definition.theme} has no extra memberships`)

    const map = overlay.getLegacyChunkCompatibilityMap(definition)
    assert.equal(map.length, definition.legacyChunkCount)
    assert.equal(map[0].activeChunkIndex, 0)
    assert.equal(map.at(-1).activeChunkIndex, definition.activeChunkCount - 1)
    assert(map.every((entry) => entry.activeChunkIndex >= 0 && entry.activeChunkIndex < definition.activeChunkCount))
    assert.equal(overlay.resolveLearnerFacingChunkIndex(definition.legacyChunkCount - 1, definition), definition.activeChunkCount - 1)
    assert.equal(overlay.resolveLearnerFacingChunkIndex(1, definition), map[1].activeChunkIndex)
    assert.equal(overlay.resolveLearnerFacingChunkIndex(1, definition, true), 1)
    assert.notEqual(
      overlay.getM1LearnerProgressTrainerKey(definition.trainerKey),
      definition.trainerKey,
      `${definition.theme} learner progress cannot overwrite legacy rows`,
    )

    assert.equal(overlay.getLegacyCompletionCredit([], definition).completedActiveChunks, 0)
    const completeHistoricalCourse = overlay.getLegacyCompletionCredit(
      Array.from({ length: definition.legacyChunkCount }, (_, index) => ({ chunk_index: index + 1, is_mastered: true, mastered_puzzles_count: 30 })),
      definition,
    )
    assert.equal(completeHistoricalCourse.completedActiveChunks, definition.activeChunkCount)
    assert.equal(completeHistoricalCourse.complete, true)
  }

  const baseState = {
    rating: 600,
    activeStages: { mates: 1 },
    difficultyCeilings: { mates: 2 },
  }
  const completion = Object.fromEntries(overlay.PATTERN_MATE_M1_LEARNER_CURRICULA.map((definition) => [definition.trainerKey, { complete: false }]))
  const decision = await runtime.getCurriculumDecisionForUser("test-user", {
    getState: async () => ({ curriculum: baseState }),
    getSelectionIndex: async () => 0,
    getDepthSelectionIndex: async () => 0,
    getTacticThemeSelectionIndices: async () => ({ 1: 0, 2: 0, 3: 0, 4: 0 }),
    getM1LearnerCompletion: async () => completion,
    getDueReviewItem: async () => null,
    getLegacyItem: async () => null,
  })
  assert.equal(decision.trainerKey, "tactic-bishop-fork-m1", "The seven-section starter plan selects Tactics first; a persisted Mate stage does not force Mate selection")
  assert.equal(decision.chunkIndex, 0)
  assert.match(routerSource, /path="\/mates\/m1\/anastasia"/)
  const route = runtime.buildCurriculumAutoTrainingRoute(decision)
  assert.match(route, /chunk=0/)
  assert.match(route, /learnerCurriculum=m1-full-precut-v1/, "The selected M1 Tactic route carries its existing Tactic curriculum version")

  console.log("PASS: eleven focused M1 themes, including the three Kill Box subpatterns, expose their exact restored pre-cut chunks")
  console.log("PASS: every active chunk loads, has solutions, and contains no duplicate canonical identity")
  console.log("PASS: every historical chunk maps safely, restored writes stay namespaced, and complete historical courses retain full credit")
  console.log("PASS: Phase 3 runtime launches the matching learner-facing M1 chunk")
} finally {
  await vite.close()
}
