import { supabase } from "../lib/supabase"

export type SubscriptionPlan =
  | "free"
  | "monthly"
  | "yearly"
  | "crypto_30"
  | "crypto_365"

export type SubscriptionStatus =
  | "inactive"
  | "active"
  | "trialing"
  | "past_due"
  | "cancelled"
  | "expired"

export interface Subscription {
  id: string
  user_id: string
  provider: string
  provider_customer_id: string | null
  provider_subscription_id: string | null
  plan: SubscriptionPlan
  status: SubscriptionStatus
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export async function getCurrentSubscription(): Promise<Subscription | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError
  if (!user) return null

  const { data, error } = await supabase
    .from("subscriptions")
    .select(`
      id,
      user_id,
      provider,
      provider_customer_id,
      provider_subscription_id,
      plan,
      status,
      current_period_end,
      cancel_at_period_end
    `)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) throw error

  return data as Subscription | null
}

export function subscriptionIsPremium(
  subscription: Subscription | null,
): boolean {
  if (!subscription) return false

  if (
    subscription.status !== "active" &&
    subscription.status !== "trialing"
  ) {
    return false
  }

  if (!subscription.current_period_end) {
    // Only an explicit manual grant may be open-ended.
    return subscription.provider === "manual"
  }

  const periodEnd = new Date(
    subscription.current_period_end,
  ).getTime()

  return Number.isFinite(periodEnd) && periodEnd > Date.now()
}

export async function hasPremiumAccess(): Promise<boolean> {
  const subscription = await getCurrentSubscription()
  return subscriptionIsPremium(subscription)
}
