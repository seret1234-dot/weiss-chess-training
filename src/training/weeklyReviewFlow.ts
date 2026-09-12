import { weeklyGameKey } from './weeklyAssessment'
import type { WeeklyStateLike } from './weeklyAdaptiveTest'

export type WeeklyExplainedReview = {
 version: 1
 gameKey: string
 currentPly: number
 furthestPly: number
 completedAt?: string
 skippedAt?: string
}

/** Existing Analyze output, not another analysis or explanation implementation. */
export type WeeklyAnalysisSnapshot = {
 classifications: Record<number, string>
 losses: Record<number, number>
 best: Record<number, string>
 unavailable: Record<number, string>
 lines: Record<number, { bestLineSan: string[]; playedLineSan: string[]; bestLineComplete: boolean; playedLineComplete: boolean }>
 coverage: Record<'white' | 'black', { eligible: number; evaluated: number; unavailable: number }>
 counts: Record<string, number>
 accuracyWhite: number | null
 accuracyBlack: number | null
}

export function explainedReviewComplete(game: NonNullable<WeeklyStateLike['games']>[number]) {
 try { return !!game.explainedReview?.completedAt && game.explainedReview.gameKey === weeklyGameKey(game.pgn ?? '') }
 catch { return false }
}

/** Continuation is allowed after an explicit skip, without claiming sequential review. */
export function explainedReviewResolved(game: NonNullable<WeeklyStateLike['games']>[number]) {
 try { return !!(game.explainedReview?.completedAt || game.explainedReview?.skippedAt) && game.explainedReview.gameKey === weeklyGameKey(game.pgn ?? '') }
 catch { return false }
}

export function weeklyReviewRoute(weekKey: string, gameIndex: number) {
 return `/analyze/board?review=1&weekly=1&weeklyGame=${gameIndex + 1}&weekKey=${encodeURIComponent(weekKey)}`
}

/** Older completed tests without this flow remain completed, not retroactively gated. */
export function pendingWeeklyReviewRoute(state: WeeklyStateLike) {
 if (state.reviewFlowVersion !== 1 || !state.weekKey) return null
 const index = state.games?.findIndex(game => game.completed && !explainedReviewResolved(game)) ?? -1
 return index < 0 ? null : weeklyReviewRoute(state.weekKey, index)
}

export function advanceExplainedReview(previous: WeeklyExplainedReview, currentPly: number, nextPly: number) {
 // Only sequential navigation extends the reviewed prefix. Back/Last/list jumps cannot skip it.
 return { ...previous, currentPly: nextPly, furthestPly:
  currentPly === previous.furthestPly && nextPly === currentPly + 1
   ? nextPly : previous.furthestPly }
}
