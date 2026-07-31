import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Chess } from "chess.js"
import { createServer } from "vite"

const root = process.cwd()
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

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
    assert.equal(manifest.files.length, 5, `${definition.theme} exposes five chunks`)
    assert.equal(
      manifest.totalPuzzles,
      definition.activeChunkCount * definition.activeChunkSize,
      `${definition.theme} retains its configured learner-facing exercise count`,
    )

    const identities = new Set()
    const contentIdentities = new Set()
    for (const file of manifest.files) {
      const data = JSON.parse(await readFile(resolve(root, `public${definition.learnerDataBasePath}`, file), "utf8"))
      assert.equal(data.puzzles.length, definition.activeChunkSize, `${definition.theme}/${file} has its configured exercise count`)
      const chunkFamilies = []
      for (const raw of data.puzzles) {
        const line = solutionLine(raw)
        assert(line.length > 0, `${definition.theme} puzzle has a solution`)
        assertLegalTimeline(raw, definition.theme)
        const key = canonical(raw)
        assert(!identities.has(key), `${definition.theme} has no duplicate canonical identity`)
        identities.add(key)
        const contentKey = contentIdentity(raw)
        assert(!contentIdentities.has(contentKey), `${definition.theme} has no duplicate displayed position and solution`)
        contentIdentities.add(contentKey)
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
    assert.equal(identities.size, definition.activeChunkCount * definition.activeChunkSize)
    assert.equal(contentIdentities.size, definition.activeChunkCount * definition.activeChunkSize)

    const map = overlay.getLegacyChunkCompatibilityMap(definition)
    assert.equal(map.length, definition.legacyChunkCount)
    assert.equal(map[0].activeChunkIndex, 0)
    assert.equal(map.at(-1).activeChunkIndex, 4)
    assert(map.every((entry) => entry.activeChunkIndex >= 0 && entry.activeChunkIndex < 5))
    assert.equal(overlay.resolveLearnerFacingChunkIndex(definition.legacyChunkCount - 1, definition), 4)
    assert.equal(overlay.resolveLearnerFacingChunkIndex(1, definition), map[1].activeChunkIndex)
    assert.equal(overlay.resolveLearnerFacingChunkIndex(1, definition, true), 1)
    assert.notEqual(
      overlay.getM1LearnerProgressTrainerKey(definition.trainerKey),
      definition.trainerKey,
      `${definition.theme} learner progress cannot overwrite legacy rows`,
    )

    assert.equal(overlay.getLegacyCompletionCredit([], definition).completedActiveChunks, 0)
    const fiveLegacyChunks = overlay.getLegacyCompletionCredit(
      Array.from({ length: 5 }, (_, index) => ({ chunk_index: index + 1, is_mastered: true, mastered_puzzles_count: 30 })),
      definition,
    )
    assert.equal(fiveLegacyChunks.completedActiveChunks, 5)
    assert.equal(fiveLegacyChunks.complete, true)
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
    getM1LearnerCompletion: async () => completion,
    getLegacyItem: async () => null,
  })
  assert.equal(decision.trainerKey, "anastasia-mate-1")
  assert.equal(decision.chunkIndex, 0)
  assert.match(routerSource, /path="\/mates\/m1\/anastasia"/)
  const route = runtime.buildCurriculumAutoTrainingRoute(decision)
  assert.match(route, /chunk=0/)
  assert.match(route, /learnerCurriculum=m1-v1/)

  console.log("PASS: nine focused M1 themes expose exactly five deterministic learner-facing chunks")
  console.log("PASS: every active chunk loads, has solutions, and contains no duplicate canonical identity")
  console.log("PASS: every legacy chunk index maps safely, legacy rows are not reused for v1 writes, and five meaningful legacy chunks receive full credit")
  console.log("PASS: Phase 3 runtime launches the matching learner-facing M1 chunk")
} finally {
  await vite.close()
}
