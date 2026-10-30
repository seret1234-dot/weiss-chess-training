import { Chess } from 'chess.js'
import { accountStorageKey } from '../auth/accountBrowserStorage'
import { weeklyGameKey } from './weeklyAssessment'
import { advanceExplainedReview, type WeeklyAnalysisSnapshot, type WeeklyExplainedReview } from './weeklyReviewFlow'

/** Durable browser resume for non-Weekly Auto games; no assessment/quota writes. */
export type AutoGameReview = {
 userId: string; id: string; pgn: string; gameKey: string
 playerColor: 'white' | 'black'; result: string
 snapshot?: WeeklyAnalysisSnapshot; explainedReview?: WeeklyExplainedReview
}
const key = (userId: string, id: string) => accountStorageKey(`weiss-auto-game-review-v1:${id}`, userId)
export const autoGameReviewRoute = (id: string) => `/analyze/board?review=1&playComputer=1&auto=1&autoReview=${encodeURIComponent(id)}`

export function readAutoGameReview(userId: string | null, id: string): AutoGameReview | null {
 if (!userId || !id) return null
 try {
  const value = JSON.parse(localStorage.getItem(key(userId, id)) || 'null') as AutoGameReview | null
  return value?.userId === userId && value.id === id && value.gameKey === weeklyGameKey(value.pgn) ? value : null
 } catch { return null }
}
function write(value: AutoGameReview) {
 // Failure must stop the handoff, not lose a completed game silently.
 localStorage.setItem(key(value.userId, value.id), JSON.stringify(value))
 return value
}
export function saveAutoGameResult(input: Omit<AutoGameReview, 'gameKey' | 'snapshot' | 'explainedReview'>) {
 if (!input.userId || !input.id || !['1-0', '0-1', '1/2-1/2'].includes(input.result)) throw new Error('A completed owned game is required.')
 const game = new Chess(); game.loadPgn(input.pgn)
 if (game.getHeaders().Result !== input.result) throw new Error('Saved game result does not match its PGN.')
 const gameKey = weeklyGameKey(input.pgn), previous = readAutoGameReview(input.userId, input.id)
 if (previous) {
  if (previous.gameKey !== gameKey || previous.result !== input.result) throw new Error('This review belongs to a different completed game.')
  return previous
 }
 return write({ ...input, gameKey })
}
function requireRecord(userId: string, id: string) {
 const value = readAutoGameReview(userId, id)
 if (!value) throw new Error('Your completed Auto game could not be restored.')
 return value
}
export function saveAutoGameAnalysis(userId: string, id: string, snapshot: WeeklyAnalysisSnapshot) {
 const value = requireRecord(userId, id)
 if (value.snapshot) return value
 return write({ ...value, snapshot, explainedReview: { version: 1, gameKey: value.gameKey, currentPly: 0, furthestPly: 0 } })
}
export function saveAutoExplainedReview(userId: string, id: string, ply: number, finish: false | true | 'skip' = false) {
 const value = requireRecord(userId, id), previous = value.explainedReview
 if (!value.snapshot || !previous) throw new Error('Complete analysis is required before review.')
 if (previous.completedAt || previous.skippedAt) return value
 const game = new Chess(); game.loadPgn(value.pgn); const total = game.history().length
 if (!Number.isInteger(ply) || ply < 0 || ply > total) throw new Error('Invalid review position.')
 if (finish === true && (previous.currentPly !== total || previous.furthestPly !== total || ply !== total)) throw new Error('Review every move in order before finishing.')
 const progress = finish === 'skip' ? { ...previous } : advanceExplainedReview(previous, previous.currentPly, ply)
 if (finish === true) progress.completedAt = new Date().toISOString()
 if (finish === 'skip') progress.skippedAt = new Date().toISOString()
 return write({ ...value, explainedReview: progress })
}
