export const TRAINING_GOAL_CONFIG = {
  effectiveCompletionFactor: 0.65,
  daysPerMonth: 30.4375,
  minimumRating: 100,
  maximumRating: 3000,
  realisticCapacityShare: 0.75,
  ambitiousCapacityShare: 1,
  ratingBands: [
    { ceiling: 800, effectiveHoursPer100: 6 },
    { ceiling: 1200, effectiveHoursPer100: 10 },
    { ceiling: 1600, effectiveHoursPer100: 18 },
    { ceiling: 2000, effectiveHoursPer100: 30 },
    { ceiling: 2200, effectiveHoursPer100: 50 },
    { ceiling: 2400, effectiveHoursPer100: 80 },
  ],
} as const

export type TrainingGoalStatus = "REALISTIC" | "AMBITIOUS" | "UNREALISTIC" | "ACHIEVED" | "LONG_TERM" | "CAUTIOUS"

export type TrainingGoals = {
  manualCurrentRating: number | null
  targetRating: number | null
  dailyMinutes: number
  timeframeMonths: number | null
  currentMilestoneRating: number | null
}

export type GoalFeasibility = {
  status: TrainingGoalStatus
  currentRating: number
  targetRating: number
  ratingGap: number
  dailyMinutes: number
  effectiveDailyMinutes: number
  timeframeMonths: number | null
  daysAvailable: number | null
  declaredHours: number | null
  effectiveHoursAvailable: number | null
  requiredEffectiveHours: number | null
  estimatedMonthsForTarget: number | null
  requiredDailyMinutes: number | null
  recommendedMilestone: number | null
  eliteCaution: boolean
}

function finiteInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : null
}

export function validTrainingRating(value: unknown): number | null {
  const rating = finiteInteger(value)
  if (rating === null) return null
  return rating >= TRAINING_GOAL_CONFIG.minimumRating && rating <= TRAINING_GOAL_CONFIG.maximumRating
    ? rating
    : null
}

export function validDailyMinutes(value: unknown): number | null {
  const minutes = finiteInteger(value)
  return minutes !== null && minutes > 0 && minutes <= 600 ? minutes : null
}

export function validTimeframeMonths(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const months = finiteInteger(value)
  return months !== null && months > 0 && months <= 120 ? months : null
}

export function readTrainingGoals(profile: Record<string, unknown> | null | undefined): TrainingGoals {
  const dailyMinutes = validDailyMinutes(profile?.daily_minutes)
    ?? validDailyMinutes(profile?.minutes_per_day)
    ?? 20

  return {
    manualCurrentRating: validTrainingRating(profile?.manual_current_rating),
    targetRating: validTrainingRating(profile?.target_rating),
    dailyMinutes,
    timeframeMonths: validTimeframeMonths(profile?.goal_timeframe_months),
    currentMilestoneRating: validTrainingRating(profile?.current_milestone_rating),
  }
}

export function serializeTrainingGoals(goals: TrainingGoals) {
  return {
    manual_current_rating: validTrainingRating(goals.manualCurrentRating),
    target_rating: validTrainingRating(goals.targetRating),
    daily_minutes: validDailyMinutes(goals.dailyMinutes) ?? 20,
    goal_timeframe_months: validTimeframeMonths(goals.timeframeMonths),
    current_milestone_rating: validTrainingRating(goals.currentMilestoneRating),
  }
}

export function serializeLegacyProfileTrainingGoals(goals: TrainingGoals) {
  return {
    target_rating: validTrainingRating(goals.targetRating),
    minutes_per_day: validDailyMinutes(goals.dailyMinutes) ?? 20,
  }
}

export function validateTrainingGoals(goals: TrainingGoals, requireTarget = false): string | null {
  if (!validDailyMinutes(goals.dailyMinutes)) return "Choose a daily practice time greater than zero."
  if (goals.manualCurrentRating !== null && !validTrainingRating(goals.manualCurrentRating)) {
    return `Current rating must be between ${TRAINING_GOAL_CONFIG.minimumRating} and ${TRAINING_GOAL_CONFIG.maximumRating}.`
  }
  if (requireTarget && !validTrainingRating(goals.targetRating)) {
    return `Choose a target rating between ${TRAINING_GOAL_CONFIG.minimumRating} and ${TRAINING_GOAL_CONFIG.maximumRating}.`
  }
  if (goals.targetRating !== null && !validTrainingRating(goals.targetRating)) {
    return `Target rating must be between ${TRAINING_GOAL_CONFIG.minimumRating} and ${TRAINING_GOAL_CONFIG.maximumRating}.`
  }
  if (goals.timeframeMonths !== null && !validTimeframeMonths(goals.timeframeMonths)) {
    return "Choose a positive timeframe or Long-term / no deadline."
  }
  if (goals.currentMilestoneRating !== null && !validTrainingRating(goals.currentMilestoneRating)) {
    return `Current milestone must be between ${TRAINING_GOAL_CONFIG.minimumRating} and ${TRAINING_GOAL_CONFIG.maximumRating}.`
  }
  if (goals.currentMilestoneRating && goals.targetRating && goals.currentMilestoneRating > goals.targetRating) {
    return "Current milestone cannot be higher than the long-term target rating."
  }
  return null
}

export function resolveTrainingCurrentRating(profile: Record<string, unknown> | null | undefined) {
  const estimated = validTrainingRating(profile?.estimated_rating)
  if (estimated) return { rating: estimated, source: "estimated training rating" }

  const manual = validTrainingRating(profile?.manual_current_rating)
  if (manual) return { rating: manual, source: "manual rating" }

  return { rating: 800, source: "starter rating" }
}

export function requiredEffectiveHours(currentRating: number, targetRating: number): number | null {
  if (targetRating <= currentRating) return 0
  let cursor = currentRating
  let hours = 0

  for (const band of TRAINING_GOAL_CONFIG.ratingBands) {
    if (cursor >= targetRating) break
    if (cursor >= band.ceiling) continue
    const end = Math.min(targetRating, band.ceiling)
    hours += ((end - cursor) / 100) * band.effectiveHoursPer100
    cursor = end
  }

  return cursor < targetRating ? null : hours
}

function reachableMilestone(currentRating: number, effectiveHoursAvailable: number): number | null {
  let candidate = currentRating
  for (let next = currentRating + 25; next <= 2400; next += 25) {
    const required = requiredEffectiveHours(currentRating, next)
    if (required === null || required > effectiveHoursAvailable * TRAINING_GOAL_CONFIG.ambitiousCapacityShare) break
    candidate = next
  }
  return candidate > currentRating ? candidate : null
}

export function assessGoalFeasibility({
  currentRating,
  targetRating,
  dailyMinutes,
  timeframeMonths,
}: {
  currentRating: number
  targetRating: number
  dailyMinutes: number
  timeframeMonths: number | null
}): GoalFeasibility {
  const current = validTrainingRating(currentRating) ?? 800
  const target = validTrainingRating(targetRating) ?? current
  const declaredMinutes = validDailyMinutes(dailyMinutes) ?? 20
  const effectiveDailyMinutes = declaredMinutes * TRAINING_GOAL_CONFIG.effectiveCompletionFactor
  const required = requiredEffectiveHours(current, target)
  const eliteCaution = required === null
  const daysAvailable = timeframeMonths === null
    ? null
    : Math.round(timeframeMonths * TRAINING_GOAL_CONFIG.daysPerMonth)
  const declaredHours = daysAvailable === null ? null : (declaredMinutes * daysAvailable) / 60
  const effectiveHoursAvailable = daysAvailable === null ? null : (effectiveDailyMinutes * daysAvailable) / 60
  const estimatedMonthsForTarget = required === null || required === 0
    ? null
    : (required * 60) / (effectiveDailyMinutes * TRAINING_GOAL_CONFIG.daysPerMonth)
  const requiredDailyMinutes = required === null || daysAvailable === null || required === 0
    ? null
    : (required * 60) / (daysAvailable * TRAINING_GOAL_CONFIG.effectiveCompletionFactor)

  let status: TrainingGoalStatus
  if (target <= current) status = "ACHIEVED"
  else if (eliteCaution && timeframeMonths !== null) status = "UNREALISTIC"
  else if (eliteCaution) status = "CAUTIOUS"
  else if (timeframeMonths === null) status = "LONG_TERM"
  else if (required! <= effectiveHoursAvailable! * TRAINING_GOAL_CONFIG.realisticCapacityShare) status = "REALISTIC"
  else if (required! <= effectiveHoursAvailable! * TRAINING_GOAL_CONFIG.ambitiousCapacityShare) status = "AMBITIOUS"
  else status = "UNREALISTIC"

  return {
    status,
    currentRating: current,
    targetRating: target,
    ratingGap: Math.max(0, target - current),
    dailyMinutes: declaredMinutes,
    effectiveDailyMinutes,
    timeframeMonths,
    daysAvailable,
    declaredHours,
    effectiveHoursAvailable,
    requiredEffectiveHours: required,
    estimatedMonthsForTarget,
    requiredDailyMinutes,
    recommendedMilestone: effectiveHoursAvailable === null || target <= current
      ? null
      : reachableMilestone(current, effectiveHoursAvailable),
    eliteCaution,
  }
}

export function goalStatusLabel(status: TrainingGoalStatus) {
  return ({
    REALISTIC: "Realistic",
    AMBITIOUS: "Ambitious",
    UNREALISTIC: "Not realistic in this timeframe",
    ACHIEVED: "Already reached",
    LONG_TERM: "Long-term goal",
    CAUTIOUS: "Needs expert context",
  } as const)[status]
}

export function goalFeasibilityMessage(feasibility: GoalFeasibility) {
  if (feasibility.status === "ACHIEVED") return "You have already reached or exceeded this target. Consider choosing a higher goal."
  if (feasibility.status === "CAUTIOUS") return "Above 2400, improvement cannot responsibly be predicted from practice time alone. Keep this as a long-term aspiration and use a nearer milestone."
  if (feasibility.status === "LONG_TERM") return "This is a long-term aspiration. We will use your next milestone and effective daily practice time to pace the course."
  if (feasibility.status === "REALISTIC") return "This looks realistic as a planning heuristic, not a guaranteed rating result."
  if (feasibility.status === "AMBITIOUS") return "This is ambitious and will require unusually consistent practice."
  return "This target is not realistic in the selected timeframe at the stated practice time. Keep it as a long-term goal and use the suggested next milestone."
}
