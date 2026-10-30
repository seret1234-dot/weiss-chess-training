import { supabase } from '../lib/supabase'
import { AUTO_TRAINERS } from './trainerCatalog'
import { autoMixedEligibilityFilter } from './autoMixedEligibility'
import { activityIdentity, logicalActivityKey, isPatternChunkActivity } from './activityIdentity'
import { getM1LearnerProgressTrainerKey } from '../trainers/patternMate/m1LearnerCurriculum'
import { getM2ToM5LearnerProgressTrainerKey } from '../trainers/patternMate/m2toM5LearnerCurriculum'
import { getPatternTacticLearnerProgressTrainerKey } from '../trainers/patternTactic/m1toM4LearnerCurriculum'

export type DueState = 'overdue' | 'due_today' | 'in_progress' | 'new'

export type NextDueItem = {
 itemType: 'trainer_chunk'
 trainerKey: string
 progressTrainerKey?: string
 learnerCurriculumVersion?: string | null
 route: string
 chunkIndex: number | null
 dueState: DueState
 priorityScore: number
 planWeight: number
 nextReviewAt: string | null
}

export type DueSummary = {
 nextItem: NextDueItem | null
 dueCount: number
}

type StudyPlanRow = {
 user_id: string
 max_active_trainers: number
 new_content_pace: string | null
 mates_weight: number
 endgames_weight: number
 board_vision_weight: number
 openings_weight: number
 master_games_weight: number
}

export type ChunkProgressRow = {
 trainer_key: string | null
 chunk_index: number | null
 next_due_at?: string | null
 next_review_at?: string | null
 is_mastered?: boolean | null
 mastered_puzzles_count?: number | null
 started_at?: string | null
}

function startOfTodayLocal() {
 const now = new Date()
 return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function endOfTodayLocal() {
 const start = startOfTodayLocal()
 return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
}

function getEffectiveNextReviewAt(row: ChunkProgressRow): string | null {
 return row.next_due_at ?? row.next_review_at ?? null
}

function getPlanWeight(plan: StudyPlanRow, category: string): number {
 if (category === 'mates') return plan.mates_weight ?? 0
 if (category === 'endgames') return plan.endgames_weight ?? 0
 if (category === 'board-vision') return plan.board_vision_weight ?? 0
 if (category === 'openings') return plan.openings_weight ?? 0
 if (category === 'master-games') return plan.master_games_weight ?? 0
 return 0
}

function getBasePriorityScore(dueState: DueState): number {
 if (dueState === 'overdue') return 4000
 if (dueState === 'due_today') return 3000
 if (dueState === 'in_progress') return 2000
 return 1000
}

function compareCandidates(a: NextDueItem, b: NextDueItem) {
 if (b.priorityScore !== a.priorityScore) {
 return b.priorityScore - a.priorityScore
 }

 if (b.planWeight !== a.planWeight) {
 return b.planWeight - a.planWeight
 }

 const aTime = a.nextReviewAt
 ? new Date(a.nextReviewAt).getTime()
 : Number.POSITIVE_INFINITY
 const bTime = b.nextReviewAt
 ? new Date(b.nextReviewAt).getTime()
 : Number.POSITIVE_INFINITY

 if (aTime !== bTime) {
 return aTime - bTime
 }

 return a.trainerKey.localeCompare(b.trainerKey)
}

function chooseDeterministicFromPool(candidates: NextDueItem[]): NextDueItem | null {
 return candidates.slice().sort(compareCandidates)[0] ?? null
}

function chooseBestCandidate(candidates: NextDueItem[]): NextDueItem | null {
 if (!candidates.length) return null

 const overdue = candidates.filter((c) => c.dueState === 'overdue')
 if (overdue.length) return chooseDeterministicFromPool(overdue)

 const dueToday = candidates.filter((c) => c.dueState === 'due_today')
 if (dueToday.length) return chooseDeterministicFromPool(dueToday)

 const inProgress = candidates.filter((c) => c.dueState === 'in_progress')
 if (inProgress.length) return chooseDeterministicFromPool(inProgress)

 const brandNew = candidates.filter((c) => c.dueState === 'new')
 if (brandNew.length) return chooseDeterministicFromPool(brandNew)

 return null
}

async function getOrCreateStudyPlan(userId: string): Promise<StudyPlanRow | null> {
 const { data: existingPlan } = await supabase
 .from('user_study_plan')
 .select('*')
 .eq('user_id', userId)
 .maybeSingle()

 if (existingPlan) {
 return existingPlan as StudyPlanRow
 }

 const { data: newPlan } = await supabase
 .from('user_study_plan')
 .insert({
 user_id: userId,
 max_active_trainers: 3,
 new_content_pace: 'moderate',
 mates_weight: 30,
 endgames_weight: 25,
 board_vision_weight: 20,
 openings_weight: 15,
 master_games_weight: 10,
 })
 .select()
 .single()

 return (newPlan as StudyPlanRow | null) ?? null
}

async function getChunkRows(userId: string): Promise<ChunkProgressRow[] | null> {
 const coreColumns = 'trainer_key, chunk_index, next_review_at, is_mastered, mastered_puzzles_count'
 const selectWithNextDue = `${coreColumns}, next_due_at, started_at`

 const { data: rowsWithNextDue, error: errorWithNextDue } = await supabase
 .from('user_chunk_progress')
 .select(selectWithNextDue)
 .eq('user_id', userId)

 if (!errorWithNextDue) {
 return (rowsWithNextDue ?? []) as ChunkProgressRow[]
 }

 const missingColumn = (column: string) => {
  const message = errorWithNextDue.message || ''
  return message.includes(column) && message.includes('does not exist')
 }
 const missingNextDue = missingColumn('next_due_at')
 const missingStartedAt = missingColumn('started_at')

 if (!missingNextDue && !missingStartedAt) {
 console.error('Could not load user_chunk_progress', errorWithNextDue)
 return null
 }

 // Preview and production can briefly run this frontend before the additive
 // migration is applied. In that window blank rows stay "new" rather than
 // regressing to the old in-progress classification.
 const selectFallback = [
  coreColumns,
  missingNextDue ? null : 'next_due_at',
  missingStartedAt ? null : 'started_at',
 ].filter(Boolean).join(', ')

 const { data: fallbackRows, error: fallbackError } = await supabase
 .from('user_chunk_progress')
 .select(selectFallback)
 .eq('user_id', userId)

 if (fallbackError) {
 console.error('Could not load user_chunk_progress fallback', fallbackError)
 return null
 }

 return (fallbackRows ?? []) as ChunkProgressRow[]
}

export function getDueStateFromRow(
 bestRow: ChunkProgressRow | undefined,
 todayStart: Date,
 tomorrowStart: Date
): {
 dueState: DueState
 chunkIndex: number | null
 nextReviewAt: string | null
} {
 let dueState: DueState = 'new'
 let chunkIndex: number | null = null
 let nextReviewAt: string | null = null

 if (!bestRow) {
 return {
 dueState,
 chunkIndex,
 nextReviewAt,
 }
 }

 // Pattern persistence is one-based; the mounted trainer URL is zero-based.
 chunkIndex = bestRow.chunk_index == null ? null : isPatternChunkActivity(bestRow.trainer_key ?? '')
  ? Math.max(0, bestRow.chunk_index - 1) : bestRow.chunk_index
 nextReviewAt = getEffectiveNextReviewAt(bestRow)

 if (!nextReviewAt) {
 // A blank row is created while a trainer loads. It is not evidence that the
 // learner began a chunk, so it must not override the rating-based plan when
 // Auto falls back to this legacy scheduler.
 const hasDurableAttempt = Boolean(bestRow.started_at) || Number(bestRow.mastered_puzzles_count ?? 0) > 0
 dueState = bestRow.is_mastered === true ? 'due_today' : hasDurableAttempt ? 'in_progress' : 'new'
 } else {
 const dueDate = new Date(nextReviewAt)

 if (dueDate < todayStart) {
 dueState = 'overdue'
 } else if (dueDate < tomorrowStart) {
 dueState = 'due_today'
 } else {
 dueState = 'in_progress'
 }
 }

 return {
 dueState,
 chunkIndex,
 nextReviewAt,
 }
}

function getBestRowByTrainer(rows: ChunkProgressRow[], tomorrowStart: Date) {
 const bestRowByTrainer = new Map<string, ChunkProgressRow>()

 // The exact current dataset row owns its chunk schedule when it exists.
 // Older aliases must not resurrect an obsolete due date for that same chunk.
 const currentKey = (key: string) => getPatternTacticLearnerProgressTrainerKey(
  getM2ToM5LearnerProgressTrainerKey(getM1LearnerProgressTrainerKey(logicalActivityKey(key))))
 const currentChunks = new Set(rows.filter(row => row.trainer_key && row.trainer_key === currentKey(row.trainer_key))
  .map(row => `${logicalActivityKey(row.trainer_key!)}|${Math.max(1, row.chunk_index ?? 1)}`))

 for (const row of rows) {
 if (!row.trainer_key) continue
 const logicalKey = logicalActivityKey(row.trainer_key)
 if (row.trainer_key !== currentKey(row.trainer_key) && currentChunks.has(`${logicalKey}|${Math.max(1, row.chunk_index ?? 1)}`)) continue
 if (row.is_mastered === true) {
 const due = getEffectiveNextReviewAt(row)
 const dueTime = due ? new Date(due).getTime() : Number.NEGATIVE_INFINITY
 if (Number.isFinite(dueTime) && dueTime >= tomorrowStart.getTime()) continue
 }

 const existing = bestRowByTrainer.get(logicalKey)
 if (!existing) {
 bestRowByTrainer.set(logicalKey, row)
 continue
 }

 const existingDue = getEffectiveNextReviewAt(existing)
 const currentDue = getEffectiveNextReviewAt(row)

 if (!existingDue && currentDue) {
 bestRowByTrainer.set(logicalKey, row)
 continue
 }

 if (existingDue && currentDue) {
 const existingTime = new Date(existingDue).getTime()
 const currentTime = new Date(currentDue).getTime()

 if (currentTime < existingTime) {
 bestRowByTrainer.set(logicalKey, row)
 }
 }
 }

 return bestRowByTrainer
}

function buildCandidates(
 plan: StudyPlanRow,
 rows: ChunkProgressRow[]
): NextDueItem[] {
 const todayStart = startOfTodayLocal()
 const tomorrowStart = endOfTodayLocal()
 const bestRowByTrainer = getBestRowByTrainer(rows, tomorrowStart)

 const candidates: NextDueItem[] = []

 for (const trainer of AUTO_TRAINERS) {
 const bestRow = bestRowByTrainer.get(logicalActivityKey(trainer.trainerKey))
 const planWeight = getPlanWeight(plan, trainer.category)

 const { dueState, chunkIndex, nextReviewAt } = getDueStateFromRow(
 bestRow,
 todayStart,
 tomorrowStart
 )

 const priorityScore = getBasePriorityScore(dueState)

 candidates.push({
 itemType: 'trainer_chunk',
    trainerKey: trainer.trainerKey,
    progressTrainerKey: bestRow?.trainer_key ?? undefined,
    learnerCurriculumVersion: bestRow?.trainer_key ? activityIdentity(bestRow.trainer_key).revision : null,
 route: trainer.route,
 chunkIndex,
 dueState,
 priorityScore,
 planWeight,
 nextReviewAt,
 })
 }

 candidates.sort(compareCandidates)
 return candidates
}

export async function getNextDueItem(
 userId: string,
 eligible: (item: NextDueItem) => Promise<boolean> = autoMixedEligibilityFilter(userId)
): Promise<NextDueItem | null> {
 const plan = await getOrCreateStudyPlan(userId)
 if (!plan) return null

 const rows = await getChunkRows(userId)
 if (!rows) return null

 const candidates = buildCandidates(plan, rows)
 const allowed = await Promise.all(candidates.map(eligible))
 return chooseBestCandidate(candidates.filter((_, index) => allowed[index]))
}

/** Due maintenance is a distinct gate; it must not introduce brand-new material. */
export async function getNextDueReviewItem(
 userId: string,
 eligible: (item: NextDueItem) => Promise<boolean> = autoMixedEligibilityFilter(userId)
): Promise<NextDueItem | null> {
 const plan = await getOrCreateStudyPlan(userId)
 if (!plan) return null
 const rows = await getChunkRows(userId)
 if (!rows) return null
 const candidates = buildCandidates(plan, rows).filter(
  (item) => item.dueState === 'overdue' || item.dueState === 'due_today'
 )
 const allowed = await Promise.all(candidates.map(eligible))
 return chooseBestCandidate(candidates.filter((_, index) => allowed[index]))
}

export async function getDueSummary(
 userId: string
): Promise<DueSummary | null> {
 const plan = await getOrCreateStudyPlan(userId)
 if (!plan) return null

 const rows = await getChunkRows(userId)
 if (!rows) return null

 const candidates = buildCandidates(plan, rows)
 const allowed = await Promise.all(candidates.map(autoMixedEligibilityFilter(userId)))
 const eligibleCandidates = candidates.filter((_, index) => allowed[index])

 const dueCount = eligibleCandidates.filter(
 (item) => item.dueState === 'overdue' || item.dueState === 'due_today'
 ).length

 return {
 nextItem: chooseBestCandidate(eligibleCandidates),
 dueCount,
 }
}
