import { supabase } from '../lib/supabase'
import { getNextSavedOpening } from '../openings/libraryData'
import { getNextSavedMasterGame } from '../masterGames/libraryData'
import { searchOpeningRecords } from '../openings/openingSearch.mjs'
import { MASTER_GAMES_FLEXIBLE_SEARCH_RPC, buildMasterGameSearchRpcArgs } from '../masterGamesFlexibleSearch.mjs'
import { getMasterGameOpeningSearch, selectCalculationDepth, selectPreferredMasterGame } from './learningPlanRules'
import { selectScheduledSection, type PersonalTrainingPlan, type TrainingSection } from './buildPersonalTrainingPlan'
import { CURRICULUM_AREAS } from './curriculum/curriculumCatalog'
import {
  buildCurriculumDecision,
  getCurriculumDecisionForUser,
  type AutoSelectionDebug,
  type CurriculumRuntimeDecision,
} from './curriculum/curriculumRuntime'
import type { CurriculumArea } from './curriculum/curriculumTypes'
import { selectCurriculumItem } from './curriculum/selectCurriculumItem'
import { isPlayableAutoRoute } from './autoPlayableRoute'
import { mixedAutoRoute, isAutoMixedEligible, masterAutoActivity, autoMixedEligibilityFilter } from './autoMixedEligibility'
import { getNextDueItem, getNextDueReviewItem } from './getNextDueItem'

type ContentActivity = { route: string; trainerKey: string; chunkIndex?: number; mixedPrerequisitesVerified?: boolean }
export type AutoActivityDependencies = {
  curriculum: (userId: string, areas: CurriculumArea[]) => Promise<CurriculumRuntimeDecision | null>
  opening: (userId: string, section: TrainingSection) => Promise<ContentActivity | null>
  masterGame: (userId: string, section: TrainingSection) => Promise<ContentActivity | null>
  masterPattern?: typeof masterAutoActivity
  mixedEligible?: typeof isAutoMixedEligible
}

/** Completed and explicitly skipped assessments both enter the same rating plan.
 * Due and in-progress assessments retain their existing higher-priority route. */
export function canUseRatingPlanAfterWeeklyAssessment(
  status: 'due' | 'in_progress' | 'complete' | 'skipped',
  reviewRoute?: string | null,
) {
  return !reviewRoute && status !== 'due' && status !== 'in_progress'
}

function isNewLegacyFallback(decision: CurriculumRuntimeDecision | null) {
  return decision?.source === 'legacy' && decision.legacyDueState === 'new'
}

function withSelectionDebug(
  decision: CurriculumRuntimeDecision,
  plan: PersonalTrainingPlan,
  section: TrainingSection | null,
  selectionReason: string,
) {
  const debug: AutoSelectionDebug = {
    trainingRating: plan.currentRating,
    ratingSource: plan.ratingSource,
    activePlanSection: section?.key ?? 'due-review',
    activePlanLabel: section?.label ?? 'Due review',
    chosenExercise: decision.route,
    selectionReason,
    subjectWeights: Object.fromEntries(plan.sections.map(item => [item.key, item.weight])),
    areaSelectionIndex: decision.selectionIndex,
    depthSelectionIndex: decision.depthSelectionIndex ?? decision.selectionIndex,
    importedEvidence: decision.adaptiveState?.importedWeakness ?? 'none',
    reinforcement: decision.adaptiveState?.reinforcement ?? {},
    curriculumRating: decision.curriculumRating,
    curriculumRatingSource: decision.curriculumRatingSource,
    ratingReconciled: decision.ratingReconciliation?.reconciled ?? false,
  }
  return { ...decision, autoSelectionDebug: debug }
}

/**
 * A persistence outage may leave the legacy scheduler as the only response.
 * Its first-new-item sort was never rating-aware, so use the existing
 * curriculum selector with the personal plan's rating rather than letting a
 * new legacy row bypass the plan. This creates no progress or curriculum rows.
 */
function planStarterDecision(
  plan: PersonalTrainingPlan,
  areas: readonly CurriculumArea[],
  selectionIndex: number,
  depthSelectionIndex = selectionIndex,
) {
  const starterState = {
    rating: plan.currentRating,
    activeStages: {},
    difficultyCeilings: {},
    themeMastery: {},
  }
  const recommendation = selectCurriculumItem({
    state: starterState,
    selectionIndex,
    depthSelectionIndex,
    excludedAreas: CURRICULUM_AREAS.filter((area) => !areas.includes(area)),
  })
  return recommendation ? buildCurriculumDecision(recommendation, selectionIndex, depthSelectionIndex) : null
}

// Reuse the personal-library rotation and existing family due/unmastered lookup.
// An empty repertoire is NOT replaced with an arbitrary hard-coded opening.
async function openingActivity(userId: string, section: TrainingSection): Promise<ContentActivity | null> {
  const { canAutoTrainOpening } = await import('../OpeningTrainerPage')
  let saved = await getNextSavedOpening(supabase)
  const visited = new Set<string>()
  while (saved?.slug && saved.slug !== 'undefined' && !visited.has(saved.id)) {
    if (await canAutoTrainOpening(saved.slug)) return { route: `/openings/${encodeURIComponent(saved.slug)}?libraryPractice=1`, trainerKey: `opening-${saved.id}` }
    visited.add(saved.id)
    saved = await getNextSavedOpening(supabase, saved.id)
  }
  if (!section.detectedOpenings?.length) return null
  const catalog: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('opening_lines')
      .select('id,slug,name,family,family_slug,variation,subvariation,eco,aliases,ply_count')
      .not('slug', 'is', null).order('name').order('id').range(from, from + 999)
    if (error) throw error
    catalog.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const families = new Set<string>()
  for (const key of section.detectedOpenings) {
    const matches = searchOpeningRecords(catalog, getMasterGameOpeningSearch(key))
    for (const line of matches) {
      if (!line.family_slug || families.has(line.family_slug)) continue
      families.add(line.family_slug)
      const args = { p_user_id: userId, p_family_slug: line.family_slug }
      const due = await supabase.rpc('get_due_openings_in_family', args)
      if (due.error) throw due.error
      let next = due.data?.[0]
      if (!next?.slug) {
        const unmastered = await supabase.rpc('get_next_unmastered_opening_in_family', { ...args, p_current_slug: null })
        if (unmastered.error) throw unmastered.error
        next = unmastered.data?.[0]
      }
      if (next?.slug && await canAutoTrainOpening(next.slug)) return {
        route: `/openings/${encodeURIComponent(next.slug)}?family=${encodeURIComponent(line.family_slug)}`,
        trainerKey: `opening-${next.id ?? next.slug}`,
      }
    }
  }
  return null
}

async function masterGameActivity(_userId: string, section: TrainingSection): Promise<ContentActivity | null> {
  const { canAutoTrainMasterGame } = await import('../MasterGamesPage')
  let saved = await getNextSavedMasterGame(supabase)
  const visited = new Set<number>()
  while (saved && Number.isSafeInteger(saved.id) && saved.id > 0 && !visited.has(saved.id)) {
    if (await canAutoTrainMasterGame(String(saved.id))) return { route: `/master-games/${encodeURIComponent(saved.slug || String(saved.id))}?libraryPractice=1`, trainerKey: `master-game-${saved.id}` }
    visited.add(saved.id)
    saved = await getNextSavedMasterGame(supabase, saved.id)
  }
  if (section.eligible === false || !section.preferredOpeningKeys?.length) return null
  for (const key of section.preferredOpeningKeys) {
    const { data, error } = await supabase.rpc(MASTER_GAMES_FLEXIBLE_SEARCH_RPC,
      buildMasterGameSearchRpcArgs({ opening: getMasterGameOpeningSearch(key), page: 1, pageSize: 30 }))
    if (error) throw error
    const candidates = [...(data ?? [])] as { id: number; slug?: string; opening?: string; eco?: string }[]
    while (candidates.length) {
      const game = selectPreferredMasterGame(candidates, section.preferredOpeningKeys)!
      candidates.splice(candidates.indexOf(game), 1)
      if (!Number.isSafeInteger(Number(game.id)) || Number(game.id) <= 0) continue
      // Honor the existing plan's short-game ceiling for NEW introductions.
      // Saved reviews above retain their existing rotation regardless of cadence.
      if (!await canAutoTrainMasterGame(String(game.id), section.maxMasterGameMoves)) continue
      return { route: `/master-games/${encodeURIComponent(game.slug || String(game.id))}`, trainerKey: `master-game-${game.id}` }
    }
  }
  return null
}

const defaults: AutoActivityDependencies = {
  curriculum: (userId, areas) => {
    // A stale locked Mixed row must not win the same legacy lookup again.
    // Keep the scheduler's ordering among every eligible due/fallback item.
    const eligible = autoMixedEligibilityFilter(userId)
    return getCurriculumDecisionForUser(userId, {
      excludedAreas: CURRICULUM_AREAS.filter(area => !areas.includes(area)),
      getDueReviewItem: id => getNextDueReviewItem(id, eligible),
      getLegacyItem: id => getNextDueItem(id, eligible),
    })
  },
  opening: openingActivity,
  masterGame: masterGameActivity,
}

/** Section weighting stays in the existing planner. This only resolves its destination. */
export async function resolvePlanAutoActivity(
  plan: PersonalTrainingPlan,
  decision: CurriculumRuntimeDecision | null,
  userId: string,
  completedSelections: number,
  excluded: TrainingSection['key'][] = [],
  dependencies: AutoActivityDependencies = defaults,
  completedCalculationSelections = completedSelections,
): Promise<CurriculumRuntimeDecision | null> {
  const verify = async (item: CurriculumRuntimeDecision | null) => {
    if (!item || !mixedAutoRoute(item.route)) return item
    try {
      return await (dependencies.mixedEligible ?? isAutoMixedEligible)(userId, item.route)
        ? { ...item, mixedPrerequisitesVerified: true } : null
    } catch { return null } // An unavailable prerequisite read cannot unlock new material.
  }
  const original = decision
  decision = await verify(decision)
  if (!decision && original) {
    const mixed = mixedAutoRoute(original.route)!
    if (mixed.family.startsWith('master-')) {
      try {
        const activity = await (dependencies.masterPattern ?? masterAutoActivity)(userId, mixed.family, mixed.depth)
        if (activity) return { ...activity, source: 'curriculum', selectionIndex: original.selectionIndex, label: original.label, explanation: original.explanation }
      } catch { /* Use the existing eligible curriculum fallback below. */ }
    }
    decision = await verify(await dependencies.curriculum(userId, [mixed.family.includes('tactic') ? 'tactics' : 'mates']))
  }
  if (!decision) return decision
  // In particular, never replace a genuine retention review or an in-progress
  // chunk with a plan slot. A *new* legacy fallback is different: it means the
  // curriculum persistence lookup was unavailable, not that a review is due.
  if (decision.source === 'legacy' && !isNewLegacyFallback(decision) && isPlayableAutoRoute(decision.route)) {
    // Historical callers did not record the due state. Keep their established
    // retention behavior unchanged; current runtime fallbacks carry it and
    // receive the richer support explanation below.
    if (!decision.legacyDueState) return decision
    return withSelectionDebug(
      decision,
      plan,
      null,
      decision.legacyDueState === 'in_progress'
        ? 'Resuming the existing in-progress chunk before selecting new material.'
        : 'A due retention review takes priority over a new rating-plan exercise.',
    )
  }
  // Older scheduler rows can contain a section key rather than a content identity.
  // Resolve that SAME section before considering a new weighted slot.
  const legacyPath = decision.route.split(/[?#]/)[0]
  const legacyKey = legacyPath.startsWith('/master-games') ? 'masterGames'
    : legacyPath.startsWith('/openings') ? 'openings'
    : /^\/(mates|tactics)(\/|$)/.test(legacyPath) ? 'tactics'
    : legacyPath.startsWith('/endgame') ? 'endgames' : null
  const section = decision.source === 'legacy' && !isNewLegacyFallback(decision) && legacyKey
    ? plan.sections.find(item => item.key === legacyKey)!
    : selectScheduledSection(plan, completedSelections, excluded)
  const fallback = isPlayableAutoRoute(decision.route) ? decision : null
  const areas: Partial<Record<TrainingSection['key'], CurriculumArea[]>> = {
    boardVision: ['board-vision'], tactics: ['mates', 'tactics'], endgames: ['endgame-piece-mates', 'endgame-studies'],
  }
  const selectedAreas = areas[section.key]
  if (selectedAreas) {
    if (decision.curriculumArea && selectedAreas.includes(decision.curriculumArea) && fallback && !isNewLegacyFallback(decision)) {
      return withSelectionDebug(decision, plan, section, section.reason)
    }
    const resolved = await dependencies.curriculum(userId, selectedAreas)
    if (resolved && isPlayableAutoRoute(resolved.route) && !isNewLegacyFallback(resolved)) {
      const verified = await verify(resolved)
      if (verified) return withSelectionDebug(verified, plan, section, section.reason)
    }
    const starter = planStarterDecision(plan, selectedAreas, completedSelections, completedCalculationSelections)
    if (starter && isPlayableAutoRoute(starter.route)) {
      return withSelectionDebug(starter, plan, section, `${section.reason} Curriculum persistence is unavailable, so the same rating placement was resolved locally.`)
    }
    return isNewLegacyFallback(fallback) ? null : fallback
  }
  const depth = selectCalculationDepth(plan.currentRating, completedCalculationSelections)
  let activity: ContentActivity | null = null
  try {
    if (section.key === 'masterTactics' || section.key === 'masterMates') {
      const area = section.key === 'masterTactics' ? 'master-tactics' : 'master-mates'
      activity = await (dependencies.masterPattern ?? masterAutoActivity)(userId, area, depth)
    } else if (section.key === 'openings') activity = await dependencies.opening(userId, section)
    else if (section.key === 'masterGames') activity = await dependencies.masterGame(userId, section)
  } catch (error) {
    console.warn('Auto activity lookup unavailable; using existing curriculum item.', error)
  }
  if (!activity || !isPlayableAutoRoute(activity.route)) return isNewLegacyFallback(fallback) ? null : fallback
  // Do not attach the previous, unrelated curriculum stage/chunk/evidence identity.
  return withSelectionDebug({ ...activity, source: decision.source, chunkIndex: activity.chunkIndex ?? null, selectionIndex: decision.selectionIndex,
    label: section.label, explanation: section.reason }, plan, section, section.reason)
}
