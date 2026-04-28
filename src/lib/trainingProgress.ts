import { supabase } from './supabase'

export const TRAINING_PROGRESS_FAST_TARGET = 5

export type TrainingProgressSaveInput = {
  course: string
  theme: string
  itemId: string
  mastery: number
  nextReviewAt?: string | null
  reviewCount?: number
  intervalDays?: number
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    console.error('Failed to get current user:', error)
    return null
  }
  return data.user?.id ?? null
}

export async function saveTrainingProgress({
  course,
  theme,
  itemId,
  mastery,
  nextReviewAt = null,
  reviewCount,
  intervalDays,
}: TrainingProgressSaveInput): Promise<void> {
  const userId = await getCurrentUserId()
  if (!userId) return

  const nowIso = new Date().toISOString()

  const payload = {
    user_id: userId,
    course,
    theme,
    item_id: itemId,
    mastery,
    next_review_at: nextReviewAt,
    review_count: reviewCount ?? mastery,
    interval_days: intervalDays ?? null,
    last_reviewed_at: nowIso,
    updated_at: nowIso,
  }

  const { error } = await supabase
    .from('training_progress')
    .upsert(payload, {
      onConflict: 'user_id,course,theme,item_id',
    })

  if (error) {
    console.error('Failed to save training progress:', error)
  }
}

export async function loadTrainingProgressMap(
  course: string,
  theme: string,
): Promise<Record<string, number>> {
  const userId = await getCurrentUserId()
  if (!userId) return {}

  const { data, error } = await supabase
    .from('training_progress')
    .select('item_id, mastery')
    .eq('user_id', userId)
    .eq('course', course)
    .eq('theme', theme)

  if (error) {
    console.error('Failed to load training progress:', error)
    return {}
  }

  const map: Record<string, number> = {}

  for (const row of data ?? []) {
    const itemId = String(row.item_id ?? '')
    if (!itemId) continue
    map[itemId] = Number(row.mastery ?? 0)
  }

  return map
}