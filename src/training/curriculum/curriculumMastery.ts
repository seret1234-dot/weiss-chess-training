import type { CurriculumArea, CurriculumState, StageMastery, ThemeMastery } from "./curriculumTypes"

export const MIXED_THEME_MASTERY_THRESHOLD = 0.8
export const STAGE_MASTERY_ATTEMPTS = 30
export const STAGE_MASTERY_ACCURACY = 0.8
export const STAGE_MASTERY_SESSION_DAYS = 3
export const MAJOR_WEAK_THEME_ACCURACY = 0.7

export function getThemeMastery(area: CurriculumArea, state: CurriculumState) {
  return state.themeMastery?.[area] ?? {}
}

export function getThemeMasteryPercent(area: CurriculumArea, themes: string[], state: CurriculumState) {
  if (!themes.length) return 0
  const progress = getThemeMastery(area, state)
  return themes.filter((theme) => progress[theme]?.mastered === true).length / themes.length
}

export function isMixedUnlocked(area: CurriculumArea, themes: string[], state: CurriculumState) {
  return getThemeMasteryPercent(area, themes, state) >= MIXED_THEME_MASTERY_THRESHOLD
}

export function isStageMastered(stage: StageMastery | undefined, themes: ThemeMastery[]) {
  if (!stage) return false
  if (stage.permanentlyMastered) return true
  const noMajorWeakTheme = themes.every((theme) => (theme.recentAccuracy ?? 1) >= MAJOR_WEAK_THEME_ACCURACY)
  return (stage.attempts ?? 0) >= STAGE_MASTERY_ATTEMPTS
    && (stage.recentAccuracy ?? 0) >= STAGE_MASTERY_ACCURACY
    && (stage.mixedAccuracy ?? 0) >= STAGE_MASTERY_ACCURACY
    && (stage.sessionDays ?? 0) >= STAGE_MASTERY_SESSION_DAYS
    && (stage.overdueReviewCount ?? 0) <= 10
    && noMajorWeakTheme
}

export function hasRegressionSignal(area: CurriculumArea, state: CurriculumState, currentStage: number, themes: ThemeMastery[]) {
  if (currentStage <= 1) return Boolean(state.temporaryReinforcement?.[area])
  const stage = state.stageMastery?.[area]?.[currentStage]
  const lowAccuracy = (stage?.recentAccuracy ?? 1) < 0.65
  const highHints = themes.some((theme) => (theme.hintRate ?? 0) >= 0.35)
  const slowSolving = themes.some((theme) => (theme.averageSolveSeconds ?? 0) >= 90)
  return Boolean(
    state.temporaryReinforcement?.[area]
    || state.failedTransferTest
    || (state.repeatedFailures ?? 0) >= 3
    || lowAccuracy
    || highHints
    || slowSolving,
  )
}
