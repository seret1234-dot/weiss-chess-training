import { createClient } from "@supabase/supabase-js"
import {
  cancelPayPalSubscription,
  configuredPlans,
  getPayPalSubscriptionDetails,
} from "../server/paypal-subscription-core.mjs"

function serverSupabase() {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Supabase server configuration is missing.",
    )
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function authenticatedUser(req, supabase) {
  const authorization = String(
    req.headers.authorization || "",
  )
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : ""

  if (!accessToken) return null

  const result = await supabase.auth.getUser(accessToken)
  return result.error ? null : result.data.user
}

function hasFutureAccess(value) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) && time > Date.now()
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store")

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  try {
    const supabase = serverSupabase()
    const user = await authenticatedUser(req, supabase)

    if (!user) {
      res.status(401).json({ error: "Authentication required" })
      return
    }

    const subscriptionResult = await supabase
      .from("subscriptions")
      .select(
        "provider,provider_subscription_id,status,current_period_end,cancel_at_period_end",
      )
      .eq("user_id", user.id)
      .maybeSingle()

    if (subscriptionResult.error) {
      throw subscriptionResult.error
    }

    const subscription = subscriptionResult.data

    if (
      !subscription ||
      subscription.provider !== "paypal" ||
      !subscription.provider_subscription_id
    ) {
      res.status(404).json({
        error: "No PayPal subscription was found for this account.",
      })
      return
    }

    if (subscription.cancel_at_period_end) {
      res.status(200).json({
        ok: true,
        alreadyCancelled: true,
        currentPeriodEnd: subscription.current_period_end,
      })
      return
    }

    const details = await getPayPalSubscriptionDetails(
      subscription.provider_subscription_id,
    )
    const plan = configuredPlans().get(String(details.plan_id || ""))
    const [customUserId, customPlan] = String(
      details.custom_id || "",
    ).split("|")

    if (
      !plan ||
      customPlan !== plan ||
      customUserId !== user.id
    ) {
      res.status(403).json({
        error: "This PayPal subscription does not belong to this account.",
      })
      return
    }

    await cancelPayPalSubscription(
      subscription.provider_subscription_id,
      "Cancelled from Weiss Chess Trainer account settings",
    )

    const currentPeriodEnd =
      subscription.current_period_end ||
      details.billing_info?.next_billing_time ||
      null

    const updateResult = await supabase
      .from("subscriptions")
      .update({
        status: hasFutureAccess(currentPeriodEnd)
          ? "active"
          : "cancelled",
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: true,
        provider_status: "CANCELLED",
        provider_updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)

    if (
      updateResult.error &&
      String(updateResult.error.message || "").includes(
        "provider_status",
      )
    ) {
      const fallback = await supabase
        .from("subscriptions")
        .update({
          status: hasFutureAccess(currentPeriodEnd)
            ? "active"
            : "cancelled",
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: true,
        })
        .eq("user_id", user.id)

      if (fallback.error) throw fallback.error
    } else if (updateResult.error) {
      throw updateResult.error
    }

    res.status(200).json({
      ok: true,
      currentPeriodEnd,
      cancelAtPeriodEnd: true,
    })
  } catch (error) {
    console.error("PayPal cancellation failed", error)
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "PayPal cancellation failed.",
    })
  }
}
