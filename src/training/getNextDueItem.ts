import { supabase } from '../lib/supabase'
import { AUTO_TRAINERS } from './trainerCatalog'

export type DueState = 'overdue' | 'due_today' | 'in_progress' | 'new'

export type NextDueItem = {
  itemType: 'trainer_chunk'
  trainerKey: string
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

type ChunkProgressRow = {
  trainer_key: string | null
  chunk_index: number | null
  next_due_at?: string | null
  next_review_at?: string | null
  is_mastered?: boolean | null
  mastered_puzzles_count?: number | null
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

function chooseWeightedFromPool(candidates: NextDueItem[]): NextDueItem | null {
  if (!candidates.length) return null

  const totalWeight = candidates.reduce((sum, candidate) => {
    return sum + Math.max(candidate.planWeight ?? 0, 1)
  }, 0)

  let r = Math.random() * totalWeight

  for (const candidate of candidates) {
    r -= Math.max(candidate.planWeight ?? 0, 1)
    if (r <= 0) {
      return candidate
    }
  }

  return candidates[0] ?? null
}

function chooseBestCandidate(candidates: NextDueItem[]): NextDueItem | null {
  if (!candidates.length) return null

  const overdue = candidates.filter((c) => c.dueState === 'overdue')
  if (overdue.length) return chooseWeightedFromPool(overdue)

  const dueToday = candidates.filter((c) => c.dueState === 'due_today')
  if (dueToday.length) return chooseWeightedFromPool(dueToday)

  const inProgress = candidates.filter((c) => c.dueState === 'in_progress')
  if (inProgress.length) return chooseWeightedFromPool(inProgress)

  const brandNew = candidates.filter((c) => c.dueState === 'new')
  if (brandNew.length) return chooseWeightedFromPool(brandNew)

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
  const selectWithNextDue =
    'trainer_key, chunk_index, next_due_at, next_review_at, is_mastered, mastered_puzzles_count'

  const { data: rowsWithNextDue, error: errorWithNextDue } = await supabase
    .from('user_chunk_progress')
    .select(selectWithNextDue)
    .eq('user_id', userId)

  if (!errorWithNextDue) {
    return (rowsWithNextDue ?? []) as ChunkProgressRow[]
  }

  const message = errorWithNextDue.message || ''
  const missingNextDue =
    message.includes('next_due_at') &&
    message.includes('does not exist')

  if (!missingNextDue) {
    console.error('Could not load user_chunk_progress', errorWithNextDue)
    return null
  }

  const selectFallback =
    'trainer_key, chunk_index, next_review_at, is_mastered, mastered_puzzles_count'

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

function getDueStateFromRow(
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

  chunkIndex = bestRow.chunk_index ?? null
  nextReviewAt = getEffectiveNextReviewAt(bestRow)

  if (!nextReviewAt) {
    dueState = 'in_progress'
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

function getBestRowByTrainer(rows: ChunkProgressRow[]) {
  const bestRowByTrainer = new Map<string, ChunkProgressRow>()

  for (const row of rows) {
    if (!row.trainer_key) continue
    if (row.is_mastered === true) continue

    const existing = bestRowByTrainer.get(row.trainer_key)
    if (!existing) {
      bestRowByTrainer.set(row.trainer_key, row)
      continue
    }

    const existingDue = getEffectiveNextReviewAt(existing)
    const currentDue = getEffectiveNextReviewAt(row)

    if (!existingDue && currentDue) {
      bestRowByTrainer.set(row.trainer_key, row)
      continue
    }

    if (existingDue && currentDue) {
      const existingTime = new Date(existingDue).getTime()
      const currentTime = new Date(currentDue).getTime()

      if (currentTime < existingTime) {
        bestRowByTrainer.set(row.trainer_key, row)
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
  const bestRowByTrainer = getBestRowByTrainer(rows)

  const candidates: NextDueItem[] = []

  for (const trainer of AUTO_TRAINERS) {
    const bestRow = bestRowByTrainer.get(trainer.trainerKey)
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
  userId: string
): Promise<NextDueItem | null> {
  const plan = await getOrCreateStudyPlan(userId)
  if (!plan) return null

  const rows = await getChunkRows(userId)
  if (!rows) return null

  const candidates = buildCandidates(plan, rows)
  return chooseBestCandidate(candidates)
}

export async function getDueSummary(
  userId: string
): Promise<DueSummary | null> {
  const plan = await getOrCreateStudyPlan(userId)
  if (!plan) return null

  const rows = await getChunkRows(userId)
  if (!rows) return null

  const candidates = buildCandidates(plan, rows)

  const dueCount = candidates.filter(
    (item) => item.dueState === 'overdue' || item.dueState === 'due_today'
  ).length

  return {
    nextItem: chooseBestCandidate(candidates),
    dueCount,
  }
}