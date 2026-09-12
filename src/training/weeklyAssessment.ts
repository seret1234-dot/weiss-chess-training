import { Chess } from 'chess.js'
import type { TrainingSectionKey } from './buildPersonalTrainingPlan'

export type WeeklySectionMultipliers = Partial<Record<TrainingSectionKey, number>>
export type WeeklyReviewSummary = {
 version: 1
 gameKey: string
 completedAt: string
 status: 'complete' | 'incomplete'
 studentMoves: number
 unavailableMoves: number
 classifications: Record<string, number>
 byPhase: Record<'opening' | 'middlegame' | 'endgame', { mistakes: number; lossCp: number }>
}
export type WeeklyAssessment = {
 version: 1
 gamesCompleted: boolean
 analysisStatus: 'pending' | 'complete'
 // Opening the engine review is not evidence of completing an explained review.
 explainedReviewStatus: 'not_recorded' | 'in_progress' | 'complete' | 'skipped'
 sectionMultipliers: WeeklySectionMultipliers
}

/** Headers/formatting may change in Analyze; the initial board and moves may not. */
export function weeklyGameKey(pgn: string) {
 const game = new Chess()
 game.loadPgn(pgn)
 const moves = game.history({ verbose: true })
 return `${moves[0]?.before ?? game.fen()}|${moves.map(m => m.from + m.to + (m.promotion ?? '')).join(' ')}`
}

export function summarizeWeeklyReview(
 pgn: string,
 learner: 'w' | 'b',
 rows: Array<{ ply: number; color: string }>,
 classifications: Record<number, string>,
 losses: Record<number, number>,
 unavailable: Record<number, string>,
): WeeklyReviewSummary {
 const summary: WeeklyReviewSummary = {
  version: 1, gameKey: weeklyGameKey(pgn), completedAt: new Date().toISOString(),
  status: 'complete', studentMoves: 0, unavailableMoves: 0, classifications: {},
  byPhase: { opening: { mistakes: 0, lossCp: 0 }, middlegame: { mistakes: 0, lossCp: 0 }, endgame: { mistakes: 0, lossCp: 0 } },
 }
 // Require a complete legal replay, not a partial selection or canceled review.
 const replay = new Chess()
 replay.loadPgn(pgn)
 if (replay.history().length !== rows.length || rows.length === 0) summary.status = 'incomplete'
 for (const row of rows) {
  if (unavailable[row.ply] || !classifications[row.ply]) summary.status = 'incomplete'
  if (row.color !== learner) continue
  summary.studentMoves++
  const label = classifications[row.ply]
  if (unavailable[row.ply] || !label) { summary.unavailableMoves++; continue }
  summary.classifications[label] = (summary.classifications[label] ?? 0) + 1
  if (!['Inaccuracy', 'Mistake', 'Blunder', 'Miss'].includes(label)) continue
  if (!Number.isFinite(losses[row.ply])) { summary.status = 'incomplete'; summary.unavailableMoves++; continue }
  // Same phase boundaries as the existing imported-game review summary.
  const phase = row.ply <= 16 ? 'opening' : row.ply <= 50 ? 'middlegame' : 'endgame'
  summary.byPhase[phase].mistakes++
  summary.byPhase[phase].lossCp += Math.max(0, losses[row.ply])
 }
 return summary
}

export function deriveWeeklyAssessment(
 games: Array<{ completed?: boolean; pgn?: string; analysis?: WeeklyReviewSummary; explainedReview?: { gameKey: string; completedAt?: string; skippedAt?: string } }>,
 coarse: WeeklySectionMultipliers,
): WeeklyAssessment {
 const gamesCompleted = games.length === 2 && games.every(game => game.completed)
 const complete = gamesCompleted && games.every(game => {
  try { return game.analysis?.status === 'complete' && game.analysis.gameKey === weeklyGameKey(game.pgn ?? '') }
  catch { return false }
 })
 const sectionMultipliers = { ...coarse }
 if (complete) {
  const phaseLoss = { opening: 0, middlegame: 0, endgame: 0 }
  for (const game of games) for (const phase of Object.keys(phaseLoss) as Array<keyof typeof phaseLoss>) {
   phaseLoss[phase] += game.analysis!.byPhase[phase].lossCp
  }
  const total = Object.values(phaseLoss).reduce((a, b) => a + b, 0)
  if (total > 0) {
   const mapping = { openings: 'opening', tactics: 'middlegame', masterTactics: 'middlegame', endgames: 'endgame' } as const
   for (const [section, phase] of Object.entries(mapping)) {
    const key = section as TrainingSectionKey
    // Reviewed loss distribution, bounded by the existing Weekly 1.35 cap.
    // MAX, not multiplication: outcome and analysis must not double-count a weakness.
    sectionMultipliers[key] = Math.max(sectionMultipliers[key] ?? 1, 1 + .35 * phaseLoss[phase] / total)
   }
  }
 }
 for (const key of Object.keys(sectionMultipliers) as TrainingSectionKey[]) {
  sectionMultipliers[key] = Number(Math.max(1, Math.min(1.35, sectionMultipliers[key] ?? 1)).toFixed(3))
 }
 const reviewed = gamesCompleted && games.every(game => game.explainedReview?.completedAt && game.explainedReview.gameKey === game.analysis?.gameKey)
 const resolved = gamesCompleted && games.every(game => (game.explainedReview?.completedAt || game.explainedReview?.skippedAt) && game.explainedReview.gameKey === game.analysis?.gameKey)
 return { version: 1, gamesCompleted, analysisStatus: complete ? 'complete' : 'pending',
  explainedReviewStatus: reviewed ? 'complete' : resolved ? 'skipped' : games.some(game => game.explainedReview) ? 'in_progress' : 'not_recorded', sectionMultipliers }
}
