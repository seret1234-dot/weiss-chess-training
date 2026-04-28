import { supabase } from "../lib/supabase"

type UpdateCategoryStatsInput = {
  userId: string
  category: string
  wasCorrect: boolean
  timeMs: number
}

export async function updateCategoryStats({
  userId,
  category,
  wasCorrect,
  timeMs,
}: UpdateCategoryStatsInput): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("user_category_stats")
    .select("attempts, correct, avg_time_ms")
    .eq("user_id", userId)
    .eq("category", category)
    .maybeSingle()

  if (fetchError) {
    console.error("updateCategoryStats fetch error", fetchError)
    return
  }

  const prevAttempts = existing?.attempts ?? 0
  const prevCorrect = existing?.correct ?? 0
  const prevAvgTime = existing?.avg_time_ms ?? 0

  const nextAttempts = prevAttempts + 1
  const nextCorrect = prevCorrect + (wasCorrect ? 1 : 0)
  const nextAvgTime = Math.round(
    (prevAvgTime * prevAttempts + timeMs) / nextAttempts
  )

  const { error: upsertError } = await supabase
    .from("user_category_stats")
    .upsert({
      user_id: userId,
      category,
      attempts: nextAttempts,
      correct: nextCorrect,
      avg_time_ms: nextAvgTime,
      updated_at: new Date().toISOString(),
    })

  if (upsertError) {
    console.error("updateCategoryStats upsert error", upsertError)
  }
}