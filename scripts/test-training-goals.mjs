import assert from "node:assert/strict"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
  const goals = await vite.ssrLoadModule("/src/training/trainingGoals.ts")
  const impossible = goals.assessGoalFeasibility({ currentRating: 600, targetRating: 3000, dailyMinutes: 10, timeframeMonths: 2 })
  assert.equal(impossible.status, "UNREALISTIC", "elite target with a short deadline clearly fails feasibility")
  assert.equal(impossible.eliteCaution, true)
  assert.equal(impossible.recommendedMilestone, 700, "elite target still gets a capacity-derived nearby milestone")

  const infeasible = goals.assessGoalFeasibility({ currentRating: 600, targetRating: 2000, dailyMinutes: 10, timeframeMonths: 2 })
  assert.equal(infeasible.status, "UNREALISTIC", "large gap and short practice window is unrealistic")
  assert.equal(infeasible.recommendedMilestone, 700, "nearby milestone is derived from capacity")
  assert.ok(infeasible.estimatedMonthsForTarget > 2)
  assert.ok(infeasible.requiredDailyMinutes > 10)

  const modest = goals.assessGoalFeasibility({ currentRating: 600, targetRating: 700, dailyMinutes: 20, timeframeMonths: 2 })
  assert.equal(modest.status, "REALISTIC", "nearby starter goal fits a reasonable window")
  const highTime = goals.assessGoalFeasibility({ currentRating: 1200, targetRating: 1600, dailyMinutes: 60, timeframeMonths: 12 })
  assert.equal(highTime.status, "REALISTIC", "larger gap can fit a high daily commitment")
  const lowTime = goals.assessGoalFeasibility({ currentRating: 1500, targetRating: 1600, dailyMinutes: 10, timeframeMonths: 1 })
  assert.equal(lowTime.status, "UNREALISTIC", "small gap can still exceed a tiny window")
  const achieved = goals.assessGoalFeasibility({ currentRating: 1600, targetRating: 1500, dailyMinutes: 20, timeframeMonths: 3 })
  assert.equal(achieved.status, "ACHIEVED")
  const longTerm = goals.assessGoalFeasibility({ currentRating: 800, targetRating: 1200, dailyMinutes: 20, timeframeMonths: null })
  assert.equal(longTerm.status, "LONG_TERM")
  assert.equal(longTerm.daysAvailable, null)
  const factor = goals.assessGoalFeasibility({ currentRating: 600, targetRating: 700, dailyMinutes: 30, timeframeMonths: 1 })
  assert.equal(factor.effectiveDailyMinutes, 19.5, "planning capacity uses the configurable 65% factor")
  const customCapacity = goals.assessGoalFeasibility({ currentRating: 600, targetRating: 700, dailyMinutes: 75, timeframeMonths: 2 })
  assert.equal(customCapacity.dailyMinutes, 75, "a custom daily-minute value reaches feasibility unchanged")
  assert.equal(customCapacity.effectiveDailyMinutes, 48.75, "custom daily minutes use the same 65% effective-capacity calculation")

  const restored = goals.readTrainingGoals({ target_rating: 1500, daily_minutes: 30, manual_current_rating: 900, goal_timeframe_months: 6, current_milestone_rating: 1000 })
  assert.deepEqual(restored, { targetRating: 1500, dailyMinutes: 30, manualCurrentRating: 900, timeframeMonths: 6, currentMilestoneRating: 1000 })
  assert.deepEqual(goals.serializeTrainingGoals(restored), { target_rating: 1500, daily_minutes: 30, manual_current_rating: 900, goal_timeframe_months: 6, current_milestone_rating: 1000 })
  assert.deepEqual(goals.serializeLegacyProfileTrainingGoals(restored), { target_rating: 1500, minutes_per_day: 30 })
  const customMinutes = goals.readTrainingGoals({ target_rating: 1500, daily_minutes: 37 })
  assert.equal(customMinutes.dailyMinutes, 37, "non-preset daily minutes are restored without coercion")
  assert.equal(goals.serializeTrainingGoals({ ...customMinutes, dailyMinutes: 75 }).daily_minutes, 75, "custom daily minutes serialize to the canonical field")
  assert.equal(goals.serializeLegacyProfileTrainingGoals({ ...customMinutes, dailyMinutes: 37 }).minutes_per_day, 37, "custom daily minutes keep the legacy mirror current")
  assert.equal(goals.validateTrainingGoals({ ...restored, dailyMinutes: 0 }), "Choose a daily practice time greater than zero.")
  assert.equal(goals.validateTrainingGoals({ ...restored, dailyMinutes: 601 }), "Choose a daily practice time greater than zero.")

  console.log("PASS: training goal feasibility, milestones, 65% capacity, and persistence serialization")
} finally {
  await vite.close()
}
