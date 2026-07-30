import {
  CURRICULUM_CATALOG,
  getCurriculumItems,
  getStageThemes,
} from "./curriculumCatalog"
import {
  getInitialCurrentStage,
  getInitialDifficultyCeiling,
  getCategoryWeights,
  normalizedRating,
} from "./curriculumPlacement"
import {
 getThemeMastery,
  getThemeMasteryPercent,
  hasRegressionSignal,
  isMixedUnlocked,
  isStageMastered,
} from "./curriculumMastery"
import { getLearnerFacingChunkIndex } from "../../trainers/patternMate/m1LearnerCurriculum"
import type {
  CurriculumArea,
  CurriculumItem,
  CurriculumRecommendation,
  CurriculumRecommendationKind,
  CurriculumSelectionInput,
  CurriculumState,
} from "./curriculumTypes"

const AREA_ORDER: CurriculumArea[] = [
  "mates",
  "tactics",
  "endgame-piece-mates",
  "endgame-studies",
  "openings",
  "master-games",
  "board-vision",
]

function cyclePick<T>(items: T[], selectionIndex: number) {
  return items[((selectionIndex % items.length) + items.length) % items.length]
}

function weightedArea(state: CurriculumState, selectionIndex: number) {
  const weights = getCategoryWeights(state)
  // A coprime stride makes the first sessions representative without introducing
  // randomness or letting one category consume the first contiguous block.
  const slot = (((selectionIndex * 37) % 100) + 100) % 100
  let cursor = 0
  for (const area of AREA_ORDER) {
    cursor += weights[area]
    if (slot < cursor) return area
  }
  return "tactics" as const
}

function stageProgress(state: CurriculumState, area: CurriculumArea, stage: number) {
  return state.stageMastery?.[area]?.[stage]
}

function currentSequentialStage(area: "mates" | "tactics", state: CurriculumState) {
  const ratingStage = getInitialCurrentStage(area, state.rating)
  const themeProgress = getThemeMastery(area, state)
  let evidenceCeiling = ratingStage

  // Explicit state in a later persistence phase is not trusted to bypass the
  // current stage's observed mastery. A low-rated player therefore cannot be
  // placed into Mate in 3 merely because a stale due row says so.
  while (evidenceCeiling < 4) {
    const themes = getStageThemes(area, evidenceCeiling)
    const mastered = isStageMastered(
      stageProgress(state, area, evidenceCeiling),
      themes.map((theme) => themeProgress[theme] ?? {}),
    )
    if (!mastered) break
    evidenceCeiling += 1
  }

  const requestedStage = state.activeStages?.[area]
  const persistedCeiling = state.difficultyCeilings?.[area] ?? 4
  return Math.max(1, Math.min(requestedStage ?? evidenceCeiling, evidenceCeiling, persistedCeiling))
}

function sequentialCeiling(area: "mates" | "tactics", state: CurriculumState, currentStage: number) {
  const initialCeiling = getInitialDifficultyCeiling(area, state.rating)
  const persistedCeiling = state.difficultyCeilings?.[area]
  return Math.min(4, persistedCeiling ?? Math.max(initialCeiling, currentStage + 1))
}

function currentPieceMateStage(state: CurriculumState) {
  const order = ["kqk", "k2r", "krk", "k2b", "kbn"] as const
  const firstUnmastered = order.findIndex((id) => !state.pieceMateMastery?.[id])
  return firstUnmastered < 0 ? order.length : firstUnmastered + 1
}

export function isDueItemAllowedByCurriculum(item: CurriculumItem, state: CurriculumState) {
  if (!item.available) return false
  if (item.area === "mates" || item.area === "tactics") {
    const currentStage = currentSequentialStage(item.area, state)
    const ceiling = sequentialCeiling(item.area, state, currentStage)
    if (item.stageOrder > ceiling) return false
    if (item.variantLevel && item.variantLevel > item.stageOrder && item.area === "tactics") return false
    if (item.isMixed && !isMixedUnlocked(item.area, getStageThemes(item.area, item.stageOrder), state)) return false
    return true
  }
  if (item.area === "endgame-piece-mates") {
    const persistedCeiling = state.difficultyCeilings?.[item.area] ?? 5
    return item.stageOrder <= Math.min(5, persistedCeiling, currentPieceMateStage(state) + 1)
  }
  if (item.area === "endgame-studies") {
    const pieceMatesComplete = currentPieceMateStage(state) === 5 && Boolean(state.pieceMateMastery?.kbn)
    const persistedCeiling = state.difficultyCeilings?.[item.area] ?? 1
    return item.stageOrder <= persistedCeiling && (pieceMatesComplete || item.stageOrder === 1)
  }
  const persistedCeiling = state.difficultyCeilings?.[item.area]
  return item.available && (persistedCeiling == null || item.stageOrder <= persistedCeiling)
}

function chooseSequentialItem(area: "mates" | "tactics", state: CurriculumState, selectionIndex: number) {
  const currentStage = currentSequentialStage(area, state)
  const ceiling = sequentialCeiling(area, state, currentStage)
  const themes = getStageThemes(area, currentStage)
  const progress = getThemeMastery(area, state)
  const themeProgress = themes.map((theme) => progress[theme] ?? {})
  const mixedUnlocked = isMixedUnlocked(area, themes, state)
  const regression = hasRegressionSignal(area, state, currentStage, themeProgress)
  const allowed = getCurriculumItems(area).filter((item) => isDueItemAllowedByCurriculum(item, state))

  let kind: CurriculumRecommendationKind = "current"
  let targetStage = currentStage
  let candidates: CurriculumItem[]
  const previewSlot = ((selectionIndex % 10) + 10) % 10 === 9

  if (regression && currentStage > 1) {
    kind = "reinforcement"
    targetStage = currentStage - 1
    candidates = allowed.filter((item) => item.stageOrder === targetStage && !item.isMixed)
  } else if (previewSlot && currentStage < ceiling) {
    kind = "preview"
    targetStage = currentStage + 1
    candidates = allowed.filter((item) => item.stageOrder === targetStage && !item.isMixed)
  } else if (!mixedUnlocked) {
    const unmastered = themes.filter((theme) => !progress[theme]?.mastered)
    const focusedTheme = cyclePick(unmastered.length ? unmastered : themes, selectionIndex)
    candidates = allowed.filter((item) => item.stageOrder === currentStage && item.theme === focusedTheme && !item.isMixed)
  } else {
    candidates = allowed.filter((item) => item.stageOrder === currentStage && item.isMixed)
  }

  const usable = candidates.length ? candidates : allowed.filter((item) => item.stageOrder <= ceiling && !item.isMixed)
  const item = cyclePick(usable, selectionIndex)
  return { item, kind, currentStage, ceiling, mixedUnlocked, regression }
}

function chooseOtherAreaItem(area: CurriculumArea, state: CurriculumState, selectionIndex: number) {
  const allowed = getCurriculumItems(area).filter((item) => isDueItemAllowedByCurriculum(item, state))
  if (!allowed.length) return null
  if (area === "endgame-piece-mates") {
    const currentStage = currentPieceMateStage(state)
    const ceiling = Math.min(5, state.difficultyCeilings?.[area] ?? 5, currentStage + 1)
    const preview = selectionIndex % 10 === 9 && currentStage < ceiling
    const target = preview ? currentStage + 1 : currentStage
    const stageItems = allowed.filter((item) => item.stageOrder === target)
    return { item: cyclePick(stageItems.length ? stageItems : allowed, selectionIndex), kind: preview ? "preview" as const : "current" as const, currentStage, ceiling }
  }
  const currentStage = Math.max(1, state.activeStages?.[area] ?? 1)
  const ceiling = Math.max(currentStage, state.difficultyCeilings?.[area] ?? currentStage)
  const preview = selectionIndex % 10 === 9 && currentStage < ceiling
  const target = preview ? currentStage + 1 : currentStage
  const stageItems = allowed.filter((item) => item.stageOrder === target)
  const item = cyclePick(stageItems.length ? stageItems : allowed, selectionIndex)
  return { item, kind: preview ? "preview" as const : "current" as const, currentStage, ceiling }
}

export function selectCurriculumItem(input: CurriculumSelectionInput): CurriculumRecommendation | null {
  const selectionIndex = input.selectionIndex ?? 0
  const firstArea = input.area ?? weightedArea(input.state, selectionIndex)
  const candidateAreas = input.area
    ? [firstArea]
    : [firstArea, ...AREA_ORDER.filter((area) => area !== firstArea)]

  for (const area of candidateAreas) {
    const selected = area === "mates" || area === "tactics"
      ? chooseSequentialItem(area, input.state, selectionIndex)
      : chooseOtherAreaItem(area, input.state, selectionIndex)
    if (!selected?.item) continue

    const item = selected.item
    const themes = area === "mates" || area === "tactics" ? getStageThemes(area, selected.currentStage) : []
    const themeMasteryPercent = themes.length ? getThemeMasteryPercent(area, themes, input.state) : undefined
    const weakness = input.state.importedWeakness === area
    const reason = selected.kind === "reinforcement"
      ? "Temporary reinforcement is active after recent difficulty evidence; permanent mastery remains unchanged."
      : selected.kind === "preview"
        ? "This is a controlled preview within the current curriculum ceiling."
        : selected.kind === "review"
          ? "This targets the weakest focused theme after mixed practice unlocked."
          : weakness
            ? "Imported-game analysis raised this category's allocation without widening its difficulty ceiling."
            : "This item is eligible at the player's current curriculum stage."

    return {
      area,
      stage: item.stage,
      route: item.route,
      trainerKey: item.trainerKey,
      // Narrow M1 learner-facing curricula expose five deterministic chunks.
      // Their source pools remain available for legacy review, but the same
      // decision that is displayed to the learner launches one of these five.
      chunkIndex: getLearnerFacingChunkIndex(item.trainerKey, selectionIndex) ?? item.chunkIndex,
      theme: item.theme ?? null,
      kind: selected.kind,
      explanation: reason,
      evidence: {
        rating: normalizedRating(input.state.rating),
        currentStage: selected.currentStage,
        themeMasteryPercent,
        mixedUnlocked: area === "mates" || area === "tactics" ? selected.mixedUnlocked : undefined,
        stageMastered: area === "mates" || area === "tactics"
          ? isStageMastered(stageProgress(input.state, area, selected.currentStage), themes.map((theme) => getThemeMastery(area, input.state)[theme] ?? {}))
          : undefined,
        reinforcementActive: area === "mates" || area === "tactics" ? selected.regression : false,
        importedWeaknessApplied: weakness,
      },
      difficultyCeiling: selected.ceiling,
    }
  }

  return null
}

export function getEligibleCurriculumItems(state: CurriculumState, area?: CurriculumArea) {
  return CURRICULUM_CATALOG.filter((item) => (!area || item.area === area) && isDueItemAllowedByCurriculum(item, state))
}
