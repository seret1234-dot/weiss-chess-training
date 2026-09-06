import type { CurriculumArea, CurriculumState, StageMastery, ThemeMastery } from "./curriculumTypes"

export const MIXED_THEME_MASTERY_THRESHOLD = 0.8
export const CONSECUTIVE_PERFECT_CHUNKS_TO_MASTER = 2
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
  const noMajorWeakTheme = themes.every((theme) => (theme.recentAccuracy ?? 1) >= MAJOR_WEAK_THEME_ACCURACY)
  const allThemesMastered = themes.length === 0 || themes.every((theme) => theme.mastered === true)
  return (stage.consecutivePerfectChunks ?? 0) >= CONSECUTIVE_PERFECT_CHUNKS_TO_MASTER
    && allThemesMastered
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
