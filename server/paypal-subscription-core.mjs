const VALID_PAYPAL_MODES = new Set(["sandbox", "live"])

export function getPayPalMode() {
  const explicitMode = String(
    process.env.PAYPAL_MODE || "",
  )
    .trim()
    .toLowerCase()

  if (explicitMode) {
    if (!VALID_PAYPAL_MODES.has(explicitMode)) {
      throw new Error(
        "PAYPAL_MODE must be either sandbox or live.",
      )
    }

    return explicitMode
  }

  const legacyBaseUrl = String(
    process.env.PAYPAL_API_BASE_URL || "",
  ).toLowerCase()

  if (legacyBaseUrl.includes("sandbox")) {
    return "sandbox"
  }

  if (legacyBaseUrl.includes("api-m.paypal.com")) {
    return "live"
  }

  // Safe default: never charge real money unless live is explicit.
  return "sandbox"
}

export function getPayPalBaseUrl() {
  const override = String(
    process.env.PAYPAL_API_BASE_URL || "",
  )
    .trim()
    .replace(/\/+$/, "")

  if (override) {
    return override
  }

  return getPayPalMode() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com"
}

export function requiredEnvironment(name) {
  const value = String(process.env[name] || "").trim()

  if (!value) {
    throw new Error(`Missing server environment variable: ${name}`)
  }

  return value
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

export async function getPayPalAccessToken() {
  const clientId = requiredEnvironment("PAYPAL_CLIENT_ID")
  const secret = requiredEnvironment("PAYPAL_SECRET")
  const authorization = Buffer.from(
    `${clientId}:${secret}`,
  ).toString("base64")

  const response = await fetch(
    `${getPayPalBaseUrl()}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        Accept: "application/json",
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
  )

  const data = await response.json().catch(() => null)

  if (!response.ok || !data?.access_token) {
    throw new Error(
      data?.error_description ||
        "PayPal server authentication failed.",
    )
  }

  return data.access_token
}

export async function paypalRequest(
  path,
  options = {},
) {
  const accessToken = await getPayPalAccessToken()
  const response = await fetch(
    `${getPayPalBaseUrl()}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.headers || {}),
      },
    },
  )

  const data =
    response.status === 204
      ? null
      : await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error_description ||
        `PayPal request failed with status ${response.status}.`,
    )
  }

  return data
}

export async function getPayPalSubscriptionDetails(
  subscriptionId,
) {
  const normalizedId = String(subscriptionId || "").trim()

  if (!/^I-[A-Z0-9]+$/i.test(normalizedId)) {
    throw new Error("Invalid PayPal subscription ID.")
  }

  let details = null

  for (let attempt = 0; attempt < 5; attempt += 1) {
    details = await paypalRequest(
      `/v1/billing/subscriptions/${encodeURIComponent(
        normalizedId,
      )}`,
    )

    if (details?.status === "ACTIVE") {
      return details
    }

    if (
      details?.status !== "APPROVED" &&
      details?.status !== "APPROVAL_PENDING"
    ) {
      return details
    }

    if (attempt < 4) {
      await sleep(1000)
    }
  }

  return details
}

export function configuredPlans() {
  const entries = [
    [process.env.PAYPAL_PLAN_MONTHLY_STANDARD, "monthly"],
    [process.env.PAYPAL_PLAN_MONTHLY_TAXED, "monthly"],
    [process.env.PAYPAL_PLAN_YEARLY_STANDARD, "yearly"],
    [process.env.PAYPAL_PLAN_YEARLY_TAXED, "yearly"],
  ].map(([planId, plan]) => [String(planId || "").trim(), plan])

  const missing = entries.filter(([planId]) => !planId)

  if (missing.length > 0) {
    throw new Error(
      "The four PayPal subscription plans are not configured.",
    )
  }

  if (new Set(entries.map(([planId]) => planId)).size !== 4) {
    throw new Error(
      "The four PayPal subscription plan IDs must be unique.",
    )
  }

  return new Map(entries)
}

function validUserId(userId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(userId || ""),
  )
}

function statusFromPayPal(paypalStatus) {
  switch (String(paypalStatus || "").toUpperCase()) {
    case "ACTIVE":
      return "active"
    case "SUSPENDED":
      return "past_due"
    case "CANCELLED":
      return "cancelled"
    case "EXPIRED":
      return "expired"
    default:
      return "inactive"
  }
}

function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function stateFromDetails({
  details,
  eventType,
  existing,
}) {
  const providerStatus = String(details.status || "").toUpperCase()
  const currentPeriodEnd =
    details.billing_info?.next_billing_time ||
    existing?.current_period_end ||
    null

  let status = statusFromPayPal(providerStatus)
  let cancelAtPeriodEnd = false

  if (providerStatus === "CANCELLED") {
    cancelAtPeriodEnd = true
    status =
      timestamp(currentPeriodEnd) > Date.now()
        ? "active"
        : "cancelled"
  }

  if (
    eventType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED" ||
    eventType === "BILLING.SUBSCRIPTION.SUSPENDED" ||
    eventType === "PAYMENT.SALE.REFUNDED" ||
    eventType === "PAYMENT.SALE.REVERSED"
  ) {
    status = "past_due"
    cancelAtPeriodEnd = false
  }

  if (eventType === "BILLING.SUBSCRIPTION.EXPIRED") {
    status = "expired"
    cancelAtPeriodEnd = false
  }

  // Never grant Premium indefinitely because PayPal omitted a billing date.
  if (status === "active" && !currentPeriodEnd) {
    throw new Error(
      "PayPal did not supply a current billing-period end date.",
    )
  }

  return {
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    providerStatus,
  }
}

async function subscriptionForUser(supabase, userId) {
  const result = await supabase
    .from("subscriptions")
    .select(
      "user_id,status,current_period_end,provider_subscription_id,provider_created_at",
    )
    .eq("user_id", userId)
    .maybeSingle()

  if (result.error) {
    // Compatibility before the v6 migration adds provider_created_at.
    if (
      String(result.error.message || "").includes(
        "provider_created_at",
      )
    ) {
      const fallback = await supabase
        .from("subscriptions")
        .select(
          "user_id,status,current_period_end,provider_subscription_id",
        )
        .eq("user_id", userId)
        .maybeSingle()

      if (fallback.error) throw fallback.error
      return fallback.data
    }

    throw result.error
  }

  return result.data
}

function isExistingNewer(existing, details) {
  if (
    !existing?.provider_subscription_id ||
    existing.provider_subscription_id === details.id
  ) {
    return false
  }

  const existingCreated = timestamp(existing.provider_created_at)
  const incomingCreated = timestamp(details.create_time)

  return existingCreated > 0 && incomingCreated > 0
    ? existingCreated > incomingCreated
    : existing.status === "active"
}

export async function synchronizePayPalSubscription({
  eventType = "BILLING.SUBSCRIPTION.UPDATED",
  subscriptionId,
  supabase,
  expectedUserId = null,
}) {
  const details = await getPayPalSubscriptionDetails(subscriptionId)
  const plan = configuredPlans().get(String(details.plan_id || ""))

  if (!plan) {
    throw new Error(
      "The PayPal subscription uses an unrecognized plan.",
    )
  }

  const customId = String(details.custom_id || "")
  const [userId, customPlan, extra] = customId.split("|")

  if (
    !validUserId(userId) ||
    customPlan !== plan ||
    extra !== undefined
  ) {
    throw new Error(
      "The PayPal subscription has an invalid account reference.",
    )
  }

  if (expectedUserId && userId !== expectedUserId) {
    throw new Error(
      "The PayPal subscription does not belong to this account.",
    )
  }

  const existing = await subscriptionForUser(supabase, userId)

  if (isExistingNewer(existing, details)) {
    return {
      ignored: true,
      reason: "older_subscription",
      userId,
      subscriptionId,
    }
  }

  const state = stateFromDetails({
    details,
    eventType,
    existing,
  })

  const subscriptionRow = {
    user_id: userId,
    provider: "paypal",
    provider_customer_id:
      details.subscriber?.payer_id || null,
    provider_subscription_id: String(details.id),
    plan,
    status: state.status,
    current_period_end: state.currentPeriodEnd,
    cancel_at_period_end: state.cancelAtPeriodEnd,
    provider_status: state.providerStatus,
    provider_created_at: details.create_time || null,
    provider_updated_at:
      details.status_update_time || new Date().toISOString(),
  }

  let upsertResult = await supabase
    .from("subscriptions")
    .upsert(subscriptionRow, { onConflict: "user_id" })
    .select(
      "plan,status,current_period_end,cancel_at_period_end,provider_subscription_id",
    )
    .single()

  if (
    upsertResult.error &&
    String(upsertResult.error.message || "").includes(
      "provider_status",
    )
  ) {
    const {
      provider_status,
      provider_created_at,
      provider_updated_at,
      ...legacyRow
    } = subscriptionRow

    void provider_status
    void provider_created_at
    void provider_updated_at

    upsertResult = await supabase
      .from("subscriptions")
      .upsert(legacyRow, { onConflict: "user_id" })
      .select(
        "plan,status,current_period_end,cancel_at_period_end,provider_subscription_id",
      )
      .single()
  }

  if (upsertResult.error) {
    throw upsertResult.error
  }

  return {
    ignored: false,
    userId,
    plan,
    status: state.status,
    currentPeriodEnd: state.currentPeriodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    providerStatus: state.providerStatus,
    subscription: upsertResult.data,
  }
}

export async function verifyAndStorePayPalSubscription({
  subscriptionId,
  userId,
  supabase,
}) {
  try {
    const details = await getPayPalSubscriptionDetails(subscriptionId)

    if (details.status !== "ACTIVE") {
      return {
        status: 409,
        body: {
          error:
            "PayPal has not activated the subscription yet. Wait a moment and try again.",
          paypalStatus: details.status,
        },
      }
    }

    const result = await synchronizePayPalSubscription({
      eventType: "BILLING.SUBSCRIPTION.ACTIVATED",
      subscriptionId,
      supabase,
      expectedUserId: userId,
    })

    if (result.ignored) {
      return {
        status: 409,
        body: {
          error:
            "A newer PayPal subscription is already linked to this account.",
        },
      }
    }

    return {
      status: 200,
      body: {
        ok: true,
        subscription: result.subscription,
      },
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "PayPal verification failed."

    const clientError =
      /invalid|does not belong|unrecognized|already linked|newer/i.test(
        message,
      )

    return {
      status: clientError ? 400 : 500,
      body: { error: message },
    }
  }
}

export async function cancelPayPalSubscription(
  subscriptionId,
  reason = "Cancelled by the subscriber",
) {
  const details = await getPayPalSubscriptionDetails(subscriptionId)
  const status = String(details.status || "").toUpperCase()

  if (status === "CANCELLED" || status === "EXPIRED") {
    return details
  }

  if (status !== "ACTIVE" && status !== "SUSPENDED") {
    throw new Error(
      `This PayPal subscription cannot be cancelled while its status is ${status || "unknown"}.`,
    )
  }

  await paypalRequest(
    `/v1/billing/subscriptions/${encodeURIComponent(
      subscriptionId,
    )}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: String(reason || "Cancelled by the subscriber").slice(
          0,
          128,
        ),
      }),
    },
  )

  return {
    ...details,
    status: "CANCELLED",
    status_update_time: new Date().toISOString(),
  }
}
