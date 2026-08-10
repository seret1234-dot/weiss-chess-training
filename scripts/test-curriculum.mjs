import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
  const placement = await vite.ssrLoadModule("/src/training/curriculum/curriculumPlacement.ts")
  const catalog = await vite.ssrLoadModule("/src/training/curriculum/curriculumCatalog.ts")
  const selector = await vite.ssrLoadModule("/src/training/curriculum/selectCurriculumItem.ts")
  const routerSource = await readFile(new URL("../src/AppRouter.tsx", import.meta.url), "utf8")

  const routeExists = (route) => {
    if (route.startsWith("/tactics/")) return /path="\/tactics\/:level\/:theme"/.test(routerSource)
    return routerSource.includes(`path="${route}"`)
  }
  const state = (extra = {}) => ({ rating: 600, ...extra })

  assert.deepEqual(placement.getInitialStageDistribution("mates", 600), [{ stage: 1, weight: 90 }, { stage: 2, weight: 10 }])
  assert.deepEqual(placement.getInitialStageDistribution("tactics", 600), [{ stage: 1, weight: 90 }, { stage: 2, weight: 10 }])
  assert.deepEqual(placement.getInitialStageDistribution("mates", 1000), [{ stage: 1, weight: 25 }, { stage: 2, weight: 65 }, { stage: 3, weight: 10 }])
  assert.deepEqual(placement.getInitialStageDistribution("tactics", 1400), [{ stage: 1, weight: 15 }, { stage: 2, weight: 45 }, { stage: 3, weight: 35 }, { stage: 4, weight: 5 }])
  assert.deepEqual(placement.getInitialStageDistribution("mates", 1800), [{ stage: 1, weight: 10 }, { stage: 2, weight: 10 }, { stage: 3, weight: 50 }, { stage: 4, weight: 30 }])

  const firstTwentyMates = Array.from({ length: 20 }, (_, selectionIndex) => selector.selectCurriculumItem({ state: state(), area: "mates", selectionIndex }))
  assert.equal(firstTwentyMates.filter((item) => item.kind === "preview").length, 2, "beginner mate selection has a 90/10 focused/preview split")
  assert.equal(firstTwentyMates.filter((item) => item.stage === "mates-m2").length, 2, "beginner mate placement includes the approved M2 preview")
  assert(firstTwentyMates.every((item) => item.difficultyCeiling === 2 && !item.stage.includes("m3")), "beginner never receives Mate in 3+")
  const firstTwentyTactics = Array.from({ length: 20 }, (_, selectionIndex) => selector.selectCurriculumItem({ state: state(), area: "tactics", selectionIndex }))
  assert.equal(firstTwentyTactics.filter((item) => item.stage === "tactics-stage-2").length, 2, "beginner tactic placement includes the approved Stage 2 preview")
  assert(firstTwentyTactics.every((item) => item.difficultyCeiling === 2 && !item.stage.includes("stage-3") && !item.stage.includes("stage-4")), "beginner never receives advanced tactics")
  const firstTwentyProgram = Array.from({ length: 20 }, (_, selectionIndex) => selector.selectCurriculumItem({ state: state(), selectionIndex }))
  assert(firstTwentyProgram.every(Boolean), "the beginner's first 20 deterministic selections are all routable")
  assert(firstTwentyProgram.every((item) => item.area !== "endgame-piece-mates" || item.stage !== "piece-mates-krk"), "the beginner's first 20 selections do not bypass Piece Mate order")

  const rating1000Mates = selector.selectCurriculumItem({ state: state({ rating: 1000 }), area: "mates", selectionIndex: 0 })
  const rating1000Tactics = selector.selectCurriculumItem({ state: state({ rating: 1000 }), area: "tactics", selectionIndex: 0 })
  assert.equal(rating1000Mates.evidence.currentStage, 2, "1000 rating starts Mates at M2")
  assert.equal(rating1000Tactics.evidence.currentStage, 2, "1000 rating starts Tactics at Stage 2")
  const rating1400Tactics = selector.selectCurriculumItem({ state: state({ rating: 1400 }), area: "tactics", selectionIndex: 0 })
  assert.equal(rating1400Tactics.evidence.currentStage, 2, "1400 rating uses the largest approved Stage 2 allocation")
  assert.equal(rating1400Tactics.difficultyCeiling, 4, "1400 rating may receive only the approved Stage 3/4 placement range")
  const rating1800Mates = selector.selectCurriculumItem({ state: state({ rating: 1800 }), area: "mates", selectionIndex: 0 })
  assert.equal(rating1800Mates.evidence.currentStage, 3, "1800 rating keeps M3 as the current Mate stage")

  const mixedMate = catalog.CURRICULUM_CATALOG.find((item) => item.area === "mates" && item.isMixed && item.stageOrder === 1)
  assert.equal(selector.isDueItemAllowedByCurriculum(mixedMate, state({ themeMastery: { mates: { anastasia: { mastered: true }, "back-rank": { mastered: true }, arabian: { mastered: true }, boden: { mastered: true }, smothered: { mastered: true }, hook: { mastered: true }, "kill-box": { mastered: true } } } })), false, "mixed motifs stay locked at 79%")
  assert.equal(selector.isDueItemAllowedByCurriculum(mixedMate, state({ themeMastery: { mates: { anastasia: { mastered: true }, "back-rank": { mastered: true }, arabian: { mastered: true }, boden: { mastered: true }, smothered: { mastered: true }, hook: { mastered: true }, "kill-box": { mastered: true }, dovetail: { mastered: true } } } })), true, "mixed motifs unlock at 80%")

  const masteryState = state({
    stageMastery: { mates: { 1: { attempts: 40, recentAccuracy: 0.9, mixedAccuracy: 0.9, sessionDays: 4, overdueReviewCount: 0 } } },
    themeMastery: { mates: Object.fromEntries(catalog.MATE_THEMES.map((theme) => [theme, { mastered: true, recentAccuracy: 0.9 }])) },
  })
  assert.equal(selector.selectCurriculumItem({ state: masteryState, area: "mates", selectionIndex: 0 }).evidence.currentStage, 2, "stage mastery advances the current stage")
  const regression = selector.selectCurriculumItem({ state: state({
    activeStages: { tactics: 2 },
    stageMastery: {
      tactics: {
        1: { attempts: 40, recentAccuracy: 0.9, mixedAccuracy: 0.9, sessionDays: 4 },
        2: { recentAccuracy: 0.5 },
      },
    },
    themeMastery: {
      tactics: Object.fromEntries(catalog.getStageThemes("tactics", 1).map((theme) => [theme, { mastered: true, recentAccuracy: 0.9 }])),
    },
  }), area: "tactics", selectionIndex: 0 })
  assert.equal(regression.kind, "reinforcement", "regression produces easier temporary reinforcement")
  assert.equal(regression.stage, "tactics-stage-1")
  assert.equal(regression.evidence.stageMastered, false, "regression does not convert temporary failure into permanent mastery loss")

  const advancedMate = catalog.CURRICULUM_CATALOG.find((item) => item.area === "mates" && item.stageOrder === 3)
  const advancedTactic = catalog.CURRICULUM_CATALOG.find((item) => item.area === "tactics" && item.stageOrder === 4)
  assert.equal(selector.isDueItemAllowedByCurriculum(advancedMate, state()), false, "old advanced mate due item is blocked by beginner ceiling")
  assert.equal(selector.isDueItemAllowedByCurriculum(advancedTactic, state()), false, "old advanced tactic due item is blocked by beginner ceiling")
  assert.equal(selector.selectCurriculumItem({ state: state({ activeStages: { mates: 3 } }), area: "mates", selectionIndex: 0 }).difficultyCeiling, 2, "stale explicit stages cannot bypass beginner mastery evidence")

  const piece = (theme) => catalog.CURRICULUM_CATALOG.find((item) => item.area === "endgame-piece-mates" && item.theme === theme)
  assert.equal(selector.isDueItemAllowedByCurriculum(piece("kqk"), state()), true)
  assert.equal(selector.isDueItemAllowedByCurriculum(piece("k2r"), state()), true)
  assert.equal(selector.isDueItemAllowedByCurriculum(piece("krk"), state()), false)
  assert.equal(selector.isDueItemAllowedByCurriculum(piece("kbn"), state()), false, "KBN remains locked")
  assert.equal(selector.isDueItemAllowedByCurriculum(piece("krk"), state({ pieceMateMastery: { kqk: true, k2r: true } })), true, "piece mate order advances one step at a time")

  const weights = placement.getCategoryWeights(state({ importedWeakness: "tactics" }))
  assert(weights.tactics > placement.DEFAULT_BEGINNER_CATEGORY_WEIGHTS.tactics, "imported tactical weakness raises category allocation")
  const weakTactics = selector.selectCurriculumItem({ state: state({ importedWeakness: "tactics" }), area: "tactics", selectionIndex: 0 })
  assert.equal(weakTactics.difficultyCeiling, 2, "weakness does not bypass tactic ceiling")
  const weakEndgame = selector.selectCurriculumItem({ state: state({ importedWeakness: "endgame-piece-mates" }), area: "endgame-piece-mates", selectionIndex: 0 })
  assert.equal(weakEndgame.stage, "piece-mates-kqk", "endgame weakness does not skip piece mate prerequisites")
  const studyBeforePieceMates = selector.getEligibleCurriculumItems(state(), "endgame-studies")
  assert(studyBeforePieceMates.every((item) => item.stageOrder === 1), "before Piece Mate mastery, only beginner Endgame Studies remain eligible")

  const unavailable = catalog.CURRICULUM_CATALOG.filter((item) => item.area === "board-vision" && !item.available)
  assert(unavailable.length >= 4, "future Board Vision exercises are explicitly unavailable")
  assert(unavailable.every((item) => !selector.isDueItemAllowedByCurriculum(item, state())), "unavailable Board Vision stages are never eligible")
  assert.equal(catalog.CURRICULUM_CATALOG.some((item) => item.trainerKey === "tactic-king-fork-m3"), true, "final-v6 active King Fork M3 is scheduled")
  assert.equal(catalog.CURRICULUM_CATALOG.some((item) => item.trainerKey === "tactic-king-fork-m4"), true, "final-v6 active King Fork M4 is scheduled")

  for (const item of catalog.CURRICULUM_CATALOG.filter((item) => item.available)) {
    assert(routeExists(item.route), `AppRouter is missing curriculum route ${item.route}`)
  }

  console.log("PASS: deterministic seven-area curriculum foundation")
  console.log(`PASS: ${catalog.CURRICULUM_CATALOG.length} catalog entries use existing routes only`)
} finally {
  await vite.close()
}
