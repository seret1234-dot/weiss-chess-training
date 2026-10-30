import { supabase } from '../lib/supabase'
import { readOwnedJson, writeOwnedJson } from '../auth/accountBrowserStorage'
import { buildWeeklyPlanSignals, type WeeklyStateLike } from './weeklyAdaptiveTest'
import { summarizeWeeklyReview, weeklyGameKey } from './weeklyAssessment'
import { CURRICULUM_CATALOG } from './curriculum/curriculumCatalog'
import { getOrCreateCurriculumState, recordTransferTestOutcome } from './curriculum/curriculumPersistence'
import { Chess } from 'chess.js'
import { advanceExplainedReview, explainedReviewResolved, type WeeklyAnalysisSnapshot } from './weeklyReviewFlow'

type ReviewEvidence = {
 rows: Array<{ ply: number; color: string }>
 classifications: Record<number, string>
 losses: Record<number, number>
 unavailable: Record<number, string>
 snapshot?: WeeklyAnalysisSnapshot
}

/** Existing owner-scoped JSON record only. No imported-game writes or schema change. */
export async function persistWeeklyReview(
 userId: string, weekKey: string, gameIndex: number, reviewedPgn: string,
 evidence: ReviewEvidence, client: any = supabase,
) {
 if (!userId || !weekKey || (gameIndex !== 0 && gameIndex !== 1)) throw new Error('Invalid Weekly review context.')
 const key = weeklyGameKey(reviewedPgn)
 for (let retry = 0; retry < 3; retry++) {
  const { data, error } = await client.from('weekly_adaptive_tests').select('state, updated_at')
   .eq('user_id', userId).eq('week_key', weekKey).maybeSingle()
  if (error || !data?.state) throw new Error('Weekly game could not be loaded for assessment persistence.')
  const state = data.state as WeeklyStateLike
  const game = state.games?.[gameIndex]
  if (!game?.completed || !game.pgn || weeklyGameKey(game.pgn) !== key || !game.color) {
   throw new Error('Reviewed PGN does not match the completed Weekly game.')
  }
  const analysis = summarizeWeeklyReview(reviewedPgn, game.color === 'white' ? 'w' : 'b',
   evidence.rows, evidence.classifications, evidence.losses, evidence.unavailable)
  // Failed/partial reruns may not erase an already verified complete analysis.
  if (analysis.status !== 'complete' && game.analysis?.status === 'complete' && game.analysis.gameKey === key) return state
  // A restored completed review must not persist analysis/transfer evidence again.
  if (game.analysis?.status === 'complete' && game.analysis.gameKey === key && game.analysisSnapshot) return state

  const transferEvidenceKeys = [...(game.transferEvidenceKeys ?? [])]
  const unmappedTransferTargets: string[] = []
  if (analysis.status === 'complete') {
   for (const op of game.transferOpportunities ?? []) {
    if (op.status !== 'recognized' && op.status !== 'missed') continue
    const target = game.transferTarget
    const item = target && target.patternKey === op.targetKey
     ? CURRICULUM_CATALOG.find(item => item.trainerKey === target.sourceTrainerKey && item.area === op.category)
     : undefined
    if (!item) { unmappedTransferTargets.push(op.targetKey); continue }
    const eventKey = `weekly:${weekKey}:${gameIndex}:${op.id}:${op.status}`
    if (transferEvidenceKeys.includes(eventKey)) continue
    await getOrCreateCurriculumState(userId, client)
    await recordTransferTestOutcome(userId, item.area, item.stageOrder,
     op.status === 'recognized' ? 'passed' : 'failed', eventKey, client)
    transferEvidenceKeys.push(eventKey)
   }
  }
  const games = [...state.games!]
  const flowFields = evidence.snapshot && analysis.status === 'complete' ? {
   analysisSnapshot: evidence.snapshot,
   explainedReview: game.explainedReview?.gameKey === key ? game.explainedReview
    : { version: 1 as const, gameKey: key, currentPly: 0, furthestPly: 0 },
  } : {}
  games[gameIndex] = { ...game, ...flowFields, analysis, transferEvidenceKeys, unmappedTransferTargets }
  const now = new Date(Math.max(Date.now(), Date.parse(data.updated_at) + 1)).toISOString()
  const next: WeeklyStateLike = { ...state, ...(evidence.snapshot ? { reviewFlowVersion: 1 as const } : {}), userId, games, updatedAt: now }
  next.planSignals = buildWeeklyPlanSignals(games.map(game => ({ ...game, color: game.color!, result: game.result ?? '*' })))
  // Compare-and-swap avoids overwriting another completed review/snapshot.
  const { data: saved, error: saveError } = await client.from('weekly_adaptive_tests')
   .update({ state: next, plan_signals: next.planSignals, updated_at: now })
   .eq('user_id', userId).eq('week_key', weekKey).eq('updated_at', data.updated_at)
   .select('state').maybeSingle()
  if (saveError) throw new Error('Weekly assessment could not be saved.')
  if (!saved) continue
  if (typeof window !== 'undefined') {
   try {
    const local = readOwnedJson<WeeklyStateLike>(localStorage, 'weiss-weekly-adaptive-test-v1', userId)
    if (!local || (local.weekKey === weekKey && local.userId === userId)) {
     // Opening review also updates local metadata. Merge only this assessment
     // into a newer local snapshot; never roll back unsaved play in the other game.
     let mirror = next
     if (local && Date.parse(local.updatedAt ?? '') > Date.parse(state.updatedAt ?? '')) {
      const localGame = local.games?.[gameIndex]
      if (!localGame?.completed || weeklyGameKey(localGame.pgn ?? '') !== key) return next
      const localGames = [...local.games]
      localGames[gameIndex] = { ...localGame, ...flowFields, analysis, transferEvidenceKeys, unmappedTransferTargets }
      mirror = { ...local, reviewFlowVersion: next.reviewFlowVersion, games: localGames, planSignals: buildWeeklyPlanSignals(localGames as Parameters<typeof buildWeeklyPlanSignals>[0]),
       updatedAt: Date.parse(local.updatedAt) > Date.parse(now) ? local.updatedAt : now }
     }
     writeOwnedJson(localStorage, 'weiss-weekly-adaptive-test-v1', mirror)
    }
   } catch { /* Cloud remains authoritative if local storage is unavailable. */ }
  }
  return next
 }
 throw new Error('Weekly state changed while saving analysis. Please retry the review.')
}

/** Save UX progress only; never awards practice credit or invents analysis evidence. */
export async function persistWeeklyExplainedReview(
 userId: string, weekKey: string, gameIndex: number, pgn: string,
 nextPly: number, complete: boolean | 'skip' = false, client: any = supabase,
) {
 if (!userId || !weekKey || ![0, 1].includes(gameIndex)) throw new Error('Invalid Weekly review context.')
 const key = weeklyGameKey(pgn)
 const replay = new Chess(); replay.loadPgn(pgn)
 const total = replay.history().length
 if (!Number.isInteger(nextPly) || nextPly < 0 || nextPly > total) throw new Error('Invalid review position.')
 for (let retry = 0; retry < 3; retry++) {
  const { data, error } = await client.from('weekly_adaptive_tests').select('state, updated_at')
   .eq('user_id', userId).eq('week_key', weekKey).maybeSingle()
  if (error || !data?.state) throw new Error('Weekly review progress could not be loaded.')
  const state = data.state as WeeklyStateLike, game = state.games?.[gameIndex]
  if (!game?.completed || weeklyGameKey(game.pgn ?? '') !== key || game.analysis?.gameKey !== key || game.analysis.status !== 'complete' || !game.analysisSnapshot) {
   throw new Error('Complete saved analysis is required before explained review.')
  }
  const previous = game.explainedReview ?? { version: 1 as const, gameKey: key, currentPly: 0, furthestPly: 0 }
  if (previous.gameKey !== key) throw new Error('Review belongs to another game.')
  if (previous.completedAt || previous.skippedAt) return state // terminal outcomes reject stale navigation/completion
  // A skip preserves the actual reviewed prefix, even if Last was selected.
  const progress = complete === 'skip' ? { ...previous } : advanceExplainedReview(previous, previous.currentPly, nextPly)
  if (complete === true && (previous.currentPly !== total || previous.furthestPly !== total || nextPly !== total)) {
   throw new Error('Review every move in order before finishing.')
  }
  if (!complete && previous.currentPly === nextPly) return state
  const now = new Date(Math.max(Date.now(), Date.parse(data.updated_at) + 1)).toISOString()
  if (complete === true) progress.completedAt = now
  if (complete === 'skip') progress.skippedAt = now
  const games = [...state.games!]; games[gameIndex] = { ...game, explainedReview: progress }
  const next: WeeklyStateLike = { ...state, games, reviewFlowVersion: 1, updatedAt: now }
  if (complete && gameIndex === 0 && (next.currentGame ?? 0) === 0) next.currentGame = 1
  if (games.length === 2 && games.every(explainedReviewResolved)) next.reviewFlowCompletedAt ??= now
  next.planSignals = buildWeeklyPlanSignals(games.map(g => ({ ...g, color: g.color!, result: g.result ?? '*' })))
  const { data: saved, error: saveError } = await client.from('weekly_adaptive_tests')
   .update({ state: next, current_game: next.currentGame, plan_signals: next.planSignals, updated_at: now })
   .eq('user_id', userId).eq('week_key', weekKey).eq('updated_at', data.updated_at).select('state').maybeSingle()
  if (saveError) throw new Error('Weekly review progress could not be saved.')
  if (!saved) continue
  if (typeof window !== 'undefined') {
   try {
    const local = readOwnedJson<WeeklyStateLike>(localStorage, 'weiss-weekly-adaptive-test-v1', userId)
    if (!local || (local.userId === userId && local.weekKey === weekKey)) {
     // Preserve newer local board snapshots; only this game's review metadata changes.
     const mirror = local && Date.parse(local.updatedAt ?? '') > Date.parse(now) ? {
      ...local, reviewFlowVersion: 1, reviewFlowCompletedAt: next.reviewFlowCompletedAt,
      currentGame: Math.max(local.currentGame ?? 0, next.currentGame ?? 0),
      games: local.games.map((g: any, i: number) => i === gameIndex ? { ...g, explainedReview: progress } : g),
     } : next
     if (mirror !== next) mirror.planSignals = buildWeeklyPlanSignals(mirror.games as Parameters<typeof buildWeeklyPlanSignals>[0])
     writeOwnedJson(localStorage, 'weiss-weekly-adaptive-test-v1', mirror)
    }
   } catch { /* Durable cloud state remains authoritative. */ }
  }
  return next
 }
 throw new Error('Weekly review changed concurrently. Please retry.')
}
