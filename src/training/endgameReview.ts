import { supabase } from '../lib/supabase'

const REVIEW_INTERVALS_DAYS = [1, 2, 3, 5, 8, 15, 30, 60, 100, 140, 170, 270, 365]

type EndgameProgressItem = {
  itemId: string
  mastery: number
}

type BuildEndgameProgressRowsInput = {
  userId: string
  theme: string
  items: EndgameProgressItem[]
  target?: number
}

type ExistingProgressRow = {
  item_id: string | null
  mastery: number | null
  next_review_at: string | null
  review_count: number | null
  interval_days: number | null
}

function startOfTomorrowLocal(now = new Date()) {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  )
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function intervalForReview(reviewCount: number) {
  const index = Math.min(
    Math.max(reviewCount - 1, 0),
    REVIEW_INTERVALS_DAYS.length - 1,
  )
  return REVIEW_INTERVALS_DAYS[index]
}

export function isEndgameReviewDue(
  nextReviewAt: string | null | undefined,
  now = new Date(),
) {
  if (!nextReviewAt) return false

  const dueTime = new Date(nextReviewAt).getTime()
  if (!Number.isFinite(dueTime)) return false

  return dueTime < startOfTomorrowLocal(now).getTime()
}

export function getEndgameReviewMastery(
  mastery: number,
  nextReviewAt: string | null | undefined,
  target = 5,
) {
  const safeMastery = Math.max(0, Math.min(target, Number(mastery) || 0))

  return safeMastery >= target &&
    (!nextReviewAt || isEndgameReviewDue(nextReviewAt))
    ? target - 1
    : safeMastery
}

export async function buildEndgameProgressRows({
  userId,
  theme,
  items,
  target = 5,
}: BuildEndgameProgressRowsInput) {
  const { data, error } = await supabase
    .from('training_progress')
    .select(
      'item_id, mastery, next_review_at, review_count, interval_days',
    )
    .eq('user_id', userId)
    .eq('course', 'endgame')
    .eq('theme', theme)

  if (error) {
    throw new Error(
      `Could not load existing ${theme} review rows: ${error.message}`,
    )
  }

  const existingByItem = new Map<string, ExistingProgressRow>()

  for (const row of (data ?? []) as ExistingProgressRow[]) {
    const itemId = String(row.item_id ?? '')
    if (itemId) existingByItem.set(itemId, row)
  }

  const now = new Date()
  const nowIso = now.toISOString()

  return items.map(({ itemId, mastery }) => {
    const incomingMastery = Math.max(
      0,
      Math.min(target, Number(mastery) || 0),
    )
    const existing = existingByItem.get(itemId)
    const existingMastery = Math.max(
      0,
      Math.min(target, Number(existing?.mastery ?? 0)),
    )
    const existingReviewCount = Math.max(
      0,
      Number(existing?.review_count ?? 0),
    )
    const existingDue = isEndgameReviewDue(
      existing?.next_review_at,
      now,
    )
    const existingNeedsReview =
      existingMastery >= target &&
      (!existing?.next_review_at || existingDue)

    if (
      existingNeedsReview &&
      incomingMastery === target - 1
    ) {
      return {
        user_id: userId,
        course: 'endgame',
        theme,
        item_id: itemId,
        mastery: existingMastery,
        next_review_at: existing?.next_review_at ?? null,
        review_count: existingReviewCount,
        interval_days: existing?.interval_days ?? null,
        last_reviewed_at: null,
        updated_at: nowIso,
      }
    }

    if (incomingMastery <= 0) {
      return {
        user_id: userId,
        course: 'endgame',
        theme,
        item_id: itemId,
        mastery: 0,
        next_review_at: null,
        review_count: 0,
        interval_days: null,
        last_reviewed_at: nowIso,
        updated_at: nowIso,
      }
    }

    if (incomingMastery < target) {
      return {
        user_id: userId,
        course: 'endgame',
        theme,
        item_id: itemId,
        mastery: incomingMastery,
        next_review_at: null,
        review_count: existingReviewCount,
        interval_days: existing?.interval_days ?? null,
        last_reviewed_at: nowIso,
        updated_at: nowIso,
      }
    }

    const isNewMastery = existingMastery < target
    const isCompletedReview = existingNeedsReview

    if (isNewMastery || isCompletedReview) {
      const reviewCount = Math.max(
        1,
        existingReviewCount + 1,
      )
      const intervalDays = intervalForReview(reviewCount)

      return {
        user_id: userId,
        course: 'endgame',
        theme,
        item_id: itemId,
        mastery: target,
        next_review_at: addDays(now, intervalDays).toISOString(),
        review_count: reviewCount,
        interval_days: intervalDays,
        last_reviewed_at: nowIso,
        updated_at: nowIso,
      }
    }

    return {
      user_id: userId,
      course: 'endgame',
      theme,
      item_id: itemId,
      mastery: target,
      next_review_at: existing?.next_review_at ?? null,
      review_count: existingReviewCount,
      interval_days: existing?.interval_days ?? null,
      last_reviewed_at: null,
      updated_at: nowIso,
    }
  })
}
