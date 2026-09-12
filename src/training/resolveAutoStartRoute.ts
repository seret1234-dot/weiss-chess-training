import { addAutoTrainingParams } from "./autoTrainingRoute"
import { buildCurriculumAutoTrainingRoute, type CurriculumRuntimeDecision } from "./curriculum/curriculumRuntime"
import type { WeeklyTestPlanStatus } from "./weeklyAdaptiveTest"
import { isPlayableAutoRoute } from './autoPlayableRoute'
import { AUTO_TRAINERS } from './trainerCatalog'
import { mixedAutoRoute } from './autoMixedEligibility'

export const AUTO_TRAINING_ENTRY_ROUTE = "/auto?continue=1"
export const AUTO_TRAINING_SAFE_STARTER_ROUTE = addAutoTrainingParams(AUTO_TRAINERS.find(item => isPlayableAutoRoute(item.route))!.route)

type AutoStartRouteInput = {
  weeklyStatus: WeeklyTestPlanStatus
  curriculumDecision: CurriculumRuntimeDecision | null
  endgameTransferAvailable?: boolean
}

/**
 * Uses the existing scheduler decision, giving an incomplete weekly transfer
 * test priority over every normal training item.
 */
export function resolveAutoStartRoute({
  weeklyStatus,
  curriculumDecision,
  endgameTransferAvailable = false,
}: AutoStartRouteInput): string {
  if (weeklyStatus.reviewRoute) return weeklyStatus.reviewRoute
  if (weeklyStatus.status === "due" || weeklyStatus.status === "in_progress") {
    return addAutoTrainingParams("/play-computer?weekly=1")
  }

  if (curriculumDecision?.route && isPlayableAutoRoute(curriculumDecision.route)
      && (!mixedAutoRoute(curriculumDecision.route) || curriculumDecision.mixedPrerequisitesVerified === true)) {
    return buildCurriculumAutoTrainingRoute(curriculumDecision)
  }

  if (endgameTransferAvailable) {
    return addAutoTrainingParams("/play-computer?endgameTransfer=1")
  }

  return AUTO_TRAINING_SAFE_STARTER_ROUTE
}
