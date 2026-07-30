import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
  const catalog = await vite.ssrLoadModule("/src/training/curriculum/curriculumCatalog.ts")
  const selector = await vite.ssrLoadModule("/src/training/curriculum/selectCurriculumItem.ts")
  const runtime = await vite.ssrLoadModule("/src/training/curriculum/curriculumRuntime.ts")
  const routeHelpers = await vite.ssrLoadModule("/src/training/autoTrainingRoute.ts")
  const autoStudySource = await readFile(new URL("../src/pages/AutoStudyPage.tsx", import.meta.url), "utf8")
  const bannerSource = await readFile(new URL("../src/components/SemiStudyBanner.tsx", import.meta.url), "utf8")
  const redirectSource = await readFile(new URL("../src/lib/useAutoStudyRedirect.ts", import.meta.url), "utf8")

  const baseState = (extra = {}) => ({
    rating: 600,
    activeStages: { tactics: 1, mates: 1, "endgame-piece-mates": 1 },
    difficultyCeilings: { tactics: 2, mates: 2, "endgame-piece-mates": 2 },
    ...extra,
  })

  // Exact 90% current-stage / 10% next-stage preview cycle.
  const tenTacticSelections = Array.from({ length: 10 }, (_, selectionIndex) =>
    selector.selectCurriculumItem({ state: baseState(), area: "tactics", selectionIndex }),
  )
  assert.equal(tenTacticSelections.filter((decision) => decision.kind === "current").length, 9)
  assert.equal(tenTacticSelections.filter((decision) => decision.kind === "preview").length, 1)
  assert(tenTacticSelections.every((decision) => decision.difficultyCeiling === 2))
  assert(tenTacticSelections.every((decision) => !decision.stage.includes("stage-3")))

  // Mixed motifs remain locked until exactly 80% of focused themes are mastered.
  const mateThemes = catalog.getStageThemes("mates", 1)
  const requiredForMixed = Math.ceil(mateThemes.length * 0.8)
  const masteryAt79 = Object.fromEntries(
    mateThemes.slice(0, requiredForMixed - 1).map((theme) => [theme, { mastered: true }]),
  )
  const masteryAt80 = Object.fromEntries(
    mateThemes.slice(0, requiredForMixed).map((theme) => [theme, { mastered: true }]),
  )
  const mixedMate = catalog.CURRICULUM_CATALOG.find((item) =>
    item.area === "mates" && item.stageOrder === 1 && item.isMixed,
  )
  assert.equal(selector.isDueItemAllowedByCurriculum(mixedMate, baseState({ themeMastery: { mates: masteryAt79 } })), false)
  assert.equal(selector.isDueItemAllowedByCurriculum(mixedMate, baseState({ themeMastery: { mates: masteryAt80 } })), true)

  // Piece mates keep the required order and only preview the immediate successor.
  const pieceRoute = (pieceMateMastery = {}) => selector.selectCurriculumItem({
    state: baseState({ pieceMateMastery, difficultyCeilings: { "endgame-piece-mates": 5 } }),
    area: "endgame-piece-mates",
    selectionIndex: 0,
  }).stage
  assert.equal(pieceRoute(), "piece-mates-kqk")
  assert.equal(pieceRoute({ kqk: true }), "piece-mates-k2r")
  assert.equal(pieceRoute({ kqk: true, k2r: true }), "piece-mates-krk")
  assert.equal(pieceRoute({ kqk: true, k2r: true, krk: true }), "piece-mates-k2b")
  assert.equal(pieceRoute({ kqk: true, k2r: true, krk: true, k2b: true }), "piece-mates-kbn")

  // One runtime decision is both the displayed recommendation and launched route.
  const decision = await runtime.getCurriculumDecisionForUser("test-user", {
    getState: async () => ({ curriculum: baseState() }),
    getSelectionIndex: async () => 9,
    getM1LearnerCompletion: async () => ({}),
    getLegacyItem: async () => {
      throw new Error("legacy fallback must not be used for a valid curriculum decision")
    },
  })
  assert.equal(decision.source, "curriculum")
  assert.equal(decision.curriculumEventKind, "preview")
  assert.equal(decision.curriculumArea, "tactics")
  const launchedRoute = runtime.buildCurriculumAutoTrainingRoute(decision)
  const params = new URLSearchParams(launchedRoute.split("?")[1])
  assert.equal(params.get("autoRoute"), decision.route)
  assert.equal(params.get("curriculumArea"), decision.curriculumArea)
  assert.equal(params.get("curriculumStage"), decision.curriculumStage)
  assert.equal(params.get("curriculumEventKind"), decision.curriculumEventKind)
  assert.equal(params.get("curriculumDecision"), decision.curriculumDecisionId)
  assert.equal(routeHelpers.buildAutoTrainingRoute(decision), launchedRoute)

  assert.match(autoStudySource, /getCurriculumDecisionForUser/)
  assert.match(autoStudySource, /buildCurriculumAutoTrainingRoute/)
  assert.match(bannerSource, /getCurriculumDecisionForUser/)
  assert.match(redirectSource, /getCurriculumDecisionForUser/)

  // A persistence/mapping failure reads the old scheduler but does not mutate it.
  let legacyReads = 0
  const fallback = await runtime.getCurriculumDecisionForUser("test-user", {
    getState: async () => {
      throw new Error("simulated persistence failure")
    },
    getSelectionIndex: async () => 0,
    getM1LearnerCompletion: async () => ({}),
    getLegacyItem: async () => {
      legacyReads += 1
      return {
        itemType: "trainer_chunk",
        trainerKey: "anastasia-mate-1",
        route: "/mates/m1/anastasia",
        chunkIndex: 1,
        dueState: "due_today",
        priorityScore: 3000,
        planWeight: 30,
        nextReviewAt: null,
      }
    },
  })
  assert.equal(legacyReads, 1)
  assert.equal(fallback.source, "legacy")
  assert.equal(fallback.route, "/mates/m1/anastasia")
  assert.match(fallback.fallbackReason, /simulated persistence failure/)

  console.log("PASS: curriculum runtime uses one deterministic decision for display and route launch")
  console.log("PASS: exact 90/10 current-stage preview cycle, ceilings, mixed gating, and piece-mate order")
  console.log("PASS: persistence failure falls back to a read-only legacy scheduler decision")
} finally {
  await vite.close()
}
