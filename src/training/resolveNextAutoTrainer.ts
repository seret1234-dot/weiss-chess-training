import { supabase } from "../lib/supabase"
import { AUTO_TRAINERS } from "./trainerCatalog"
import { computeAdaptiveCategoryWeights } from "./computeAdaptiveCategoryWeights"

type ResolveResult = {
  trainerKey: string
  route: string
}

export async function resolveNextAutoTrainer(userId: string): Promise<ResolveResult | null> {
  // 1. get plan
  let { data: plan } = await supabase
    .from("user_study_plan")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (!plan) {
    const { data: newPlan } = await supabase
      .from("user_study_plan")
      .insert({
        user_id: userId,
        max_active_trainers: 3,
        new_content_pace: "moderate",
        mates_weight: 30,
        endgames_weight: 25,
        board_vision_weight: 20,
        openings_weight: 15,
        master_games_weight: 10,
      })
      .select()
      .single()

    if (!newPlan) return null
    plan = newPlan
  }

  // 2. get chunk activity
  const { data: chunkRows } = await supabase
    .from("user_chunk_progress")
    .select("trainer_key, next_due_at")
    .eq("user_id", userId)

  const now = new Date()

  const dueSet = new Set<string>()
  const activeSet = new Set<string>()

  for (const row of chunkRows || []) {
    if (!row.trainer_key) continue

    activeSet.add(row.trainer_key)

    if (row.next_due_at && new Date(row.next_due_at) <= now) {
      dueSet.add(row.trainer_key)
    }
  }

  const activeCount = activeSet.size

  // 3. get category stats
  const { data: statsRows } = await supabase
    .from("user_category_stats")
    .select("category_key, attempts, correct, avg_time_ms")
    .eq("user_id", userId)

  const adaptive = computeAdaptiveCategoryWeights(statsRows || [])
  const categoryMultiplier = adaptive.byCategory

  function getPlanWeight(category: string): number {
    if (category === "mates") return plan.mates_weight
    if (category === "endgames") return plan.endgames_weight
    if (category === "board-vision") return plan.board_vision_weight
    if (category === "openings") return plan.openings_weight
    if (category === "master-games") return plan.master_games_weight
    return 0
  }

  // 4. scoring
  const scored = AUTO_TRAINERS.map((trainer) => {
    let score = 0

    const isDue = dueSet.has(trainer.trainerKey)
    const isActive = activeSet.has(trainer.trainerKey)
    const isNew = !isActive

    // priority 1: due
    if (isDue) {
      score += 1000
    }
    // priority 2: active
    else if (isActive) {
      score += 300
    }

    // prevent opening new trainers if too many active
    if (isNew && activeCount >= plan.max_active_trainers) {
      score -= 500
    }

    const baseWeight = getPlanWeight(trainer.category)
    const multiplier = categoryMultiplier[trainer.category] ?? 1

    // due stays untouched; adapt only active/new ranking
    const adaptiveWeight = isDue ? baseWeight : baseWeight * multiplier

    score += adaptiveWeight

    return { trainer, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]?.trainer
  if (!best) return null

  return {
    trainerKey: best.trainerKey,
    route: best.route,
  }
}