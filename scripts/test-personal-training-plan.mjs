import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({
 server: { middlewareMode: true },
 appType: "custom",
})

try {
 const planner = await vite.ssrLoadModule("/src/training/buildPersonalTrainingPlan.ts")
 const analysis = await vite.ssrLoadModule("/src/training/engineAnalyzeImportedGames.ts")
 const routerSource = await readFile(new URL("../src/AppRouter.tsx", import.meta.url), "utf8")

 const {
  buildPersonalTrainingPlan,
  getRecommendedSection,
  NO_ANALYSIS_PLAN_MESSAGE,
 } = planner
 const { buildSummary } = analysis

 function profile({ rating = 652, analyzedGames = 0, summary = null, openingProfile = null } = {}) {
  return {
   estimated_rating: rating,
   detected_ratings: { rapid: rating },
   engine_analyzed_games_count: analyzedGames,
   engine_analysis_summary: summary,
   opening_profile: openingProfile,
  }
 }

 function summary({ analyzedGames, opening, middlegame, endgame, inaccuracies = 0, mistakes = 0, blunders = 0 }) {
  return {
   analyzedGames,
   mistakes: opening + middlegame + endgame,
   byPhase: { opening, middlegame, endgame },
   bySeverity: { inaccuracy: inaccuracies, mistake: mistakes, blunder: blunders },
  }
 }

 function weights(plan) {
  return Object.fromEntries(plan.sections.map((section) => [section.key, section.weight]))
 }

 function assertWeights(plan, expected, label) {
  assert.deepEqual(weights(plan), expected, `${label}: unexpected section weights`)
 }

 function assertRouteExists(route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  assert.match(routerSource, new RegExp(`path=["']${escaped}["']`), `AppRouter is missing ${route}`)
 }

 const realPlan = buildPersonalTrainingPlan(profile({
  analyzedGames: 112,
  summary: summary({
   analyzedGames: 112,
   opening: 114,
   middlegame: 467,
   endgame: 216,
   inaccuracies: 423,
   mistakes: 189,
   blunders: 185,
  }),
 }))
assertWeights(realPlan, { boardVision: 8, openings: 9, tactics: 36, masterTactics: 21, endgames: 10, masterMates: 11, masterGames: 5 }, "production-shaped fixture")
assert.deepEqual(realPlan.sections.map((section) => section.key), ["boardVision", "openings", "tactics", "masterTactics", "endgames", "masterMates", "masterGames"])
assert.equal(getRecommendedSection(realPlan).key, "tactics")
assertRouteExists(getRecommendedSection(realPlan).route)

 const endgamePlan = buildPersonalTrainingPlan(profile({
  analyzedGames: 50,
  summary: summary({ analyzedGames: 50, opening: 10, middlegame: 15, endgame: 75, mistakes: 20, blunders: 10 }),
 }))
 assertWeights(endgamePlan, { boardVision: 8, openings: 7, tactics: 22, masterTactics: 15, endgames: 32, masterMates: 11, masterGames: 5 }, "strong endgame fixture")
 assert.equal(getRecommendedSection(endgamePlan).key, "endgames")
 assertRouteExists(getRecommendedSection(endgamePlan).route)

 const weakOpeningProfile = {
  white: [{ key: "Sicilian", count: 18, score: 5.4, avgScore: 0.3 }],
  black: [{ key: "French", count: 12, score: 3.6, avgScore: 0.3 }],
 }
 const openingPlan = buildPersonalTrainingPlan(profile({
  analyzedGames: 50,
  openingProfile: weakOpeningProfile,
  summary: summary({ analyzedGames: 50, opening: 75, middlegame: 15, endgame: 10, mistakes: 20, blunders: 10 }),
 }))
 assertWeights(openingPlan, { boardVision: 8, openings: 25, tactics: 22, masterTactics: 18, endgames: 13, masterMates: 11, masterGames: 3 }, "strong opening fixture")
 const openingRecommendation = getRecommendedSection(openingPlan)
 assert.equal(openingRecommendation.key, "openings")
 assert.equal(openingRecommendation.route, "/openings")
 assertRouteExists(openingRecommendation.route)

 const noAnalysisPlan = buildPersonalTrainingPlan(profile({ analyzedGames: 20 }))
 assertWeights(noAnalysisPlan, { boardVision: 8, openings: 13, tactics: 32, masterTactics: 18, endgames: 13, masterMates: 11, masterGames: 5 }, "no-analysis fixture")
assert.equal(getRecommendedSection(noAnalysisPlan).key, "tactics")
assertRouteExists(getRecommendedSection(noAnalysisPlan).route)
 assert.equal(noAnalysisPlan.analysisAvailable, false)
 assert.equal(noAnalysisPlan.analysisMessage, NO_ANALYSIS_PLAN_MESSAGE)

 const smallSamplePlan = buildPersonalTrainingPlan(profile({
  analyzedGames: 11,
  summary: summary({ analyzedGames: 11, opening: 2, middlegame: 2, endgame: 36, mistakes: 20, blunders: 10 }),
 }))
 assertWeights(smallSamplePlan, { boardVision: 8, openings: 13, tactics: 32, masterTactics: 18, endgames: 13, masterMates: 11, masterGames: 5 }, "small-sample fixture")
 assert.equal(smallSamplePlan.analysisAvailable, false)

 const updatedTacticsPlan = realPlan
 const updatedEndgamePlan = endgamePlan
 assert.notDeepEqual(weights(updatedTacticsPlan), weights(updatedEndgamePlan), "updated analysis must rebuild the plan")
 assert.notEqual(getRecommendedSection(updatedTacticsPlan).key, getRecommendedSection(updatedEndgamePlan).key, "updated analysis must not retain a stale recommendation")

 const chainSummary = buildSummary([
  { severity: "blunder", phase: "middlegame", time_class: "rapid", eval_loss_cp: 350 },
  { severity: "mistake", phase: "middlegame", time_class: "rapid", eval_loss_cp: 180 },
  { severity: "inaccuracy", phase: "opening", time_class: "blitz", eval_loss_cp: 80 },
  ...Array.from({ length: 27 }, (_, index) => ({
   severity: index % 2 ? "mistake" : "inaccuracy",
   phase: "middlegame",
   time_class: "rapid",
   eval_loss_cp: 100,
  })),
 ], 20)
 const chainPlan = buildPersonalTrainingPlan(profile({ analyzedGames: 20, summary: chainSummary }))
 assert.equal(chainPlan.analysisAvailable, true)
 assert.equal(getRecommendedSection(chainPlan).key, "tactics")

 const lowCapacityPlan = buildPersonalTrainingPlan({
  estimated_rating: 600,
  target_rating: 2000,
  daily_minutes: 10,
  goal_timeframe_months: 2,
 })
 const highCapacityPlan = buildPersonalTrainingPlan({
  estimated_rating: 600,
  target_rating: 2000,
  daily_minutes: 60,
  goal_timeframe_months: 12,
 })
 const customCapacityPlan = buildPersonalTrainingPlan({
  estimated_rating: 600,
  target_rating: 1200,
  daily_minutes: 75,
  goal_timeframe_months: 12,
 })
 const oddCustomCapacityPlan = buildPersonalTrainingPlan({
  estimated_rating: 600,
  target_rating: 1200,
  daily_minutes: 37,
  goal_timeframe_months: 12,
 })
 const lowMasterCadence = lowCapacityPlan.sections.find((section) => section.key === "masterGames").newMasterGameEveryDays
 const highMasterCadence = highCapacityPlan.sections.find((section) => section.key === "masterGames").newMasterGameEveryDays
 assert.equal(lowCapacityPlan.goalFeasibility.status, "UNREALISTIC", "goal feasibility reaches the planner")
 assert.equal(lowCapacityPlan.nextMilestone, 700, "planner uses the feasibility milestone while retaining the long-term target")
 assert.equal(lowCapacityPlan.effectiveDailyPracticeMinutes, 6.5, "planner uses 65% effective daily practice time")
 assert.equal(lowMasterCadence, 60, "under-1000 cadence is locked to 60 days")
 assert.equal(highMasterCadence, 60, "daily capacity does not alter locked new-game cadence")
 assert.equal(buildPersonalTrainingPlan(profile({ rating: 1200 })).sections.find((section) => section.key === "masterGames").newMasterGameEveryDays, 30)
 assert.equal(buildPersonalTrainingPlan(profile({ rating: 1800 })).sections.find((section) => section.key === "masterGames").newMasterGameEveryDays, 7)
 assert.equal(customCapacityPlan.dailyPracticeMinutes, 75, "planner receives a custom daily-minute value")
 assert.equal(customCapacityPlan.effectiveDailyPracticeMinutes, 48.75, "planner preserves 65% capacity for a custom value")
 assert.equal(oddCustomCapacityPlan.dailyPracticeMinutes, 37, "planner receives non-preset daily minutes")
 assert.equal(oddCustomCapacityPlan.effectiveDailyPracticeMinutes, 24.05, "planner preserves 65% capacity for non-preset minutes")

 console.log("PASS: production-shaped tactical/middlegame fixture")
 console.log("PASS: strong endgame fixture")
 console.log("PASS: strong opening fixture and /openings route")
 console.log("PASS: no-analysis starter-plan provenance")
 console.log("PASS: small-sample gate")
 console.log("PASS: updated analysis replaces the recommendation")
 console.log("PASS: real buildSummary -> planner chain")
 console.log("PASS: goal capacity affects feasibility while rating alone locks new Master Game cadence")
} finally {
 await vite.close()
}
