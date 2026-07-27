require("dotenv").config({ path: ".env.local" })
require("dotenv").config()

const express = require("express")
const cors = require("cors")
const multer = require("multer")
const OpenAI = require("openai")
const { Chess } = require("chess.js")
const { createClient } = require("@supabase/supabase-js")

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
})

const PORT = Number(process.env.IMAGE_TO_POSITION_PORT || 8787)

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
      "http://127.0.0.1:5175",
    ],
    exposedHeaders: ["Server-Timing"],
  }),
)

app.use(express.json({ limit: "256kb" }))

function normalizeFen(rawFen) {
  let fen = String(rawFen || "").trim()
  fen = fen.replace(/\s+/g, " ")

  const parts = fen.split(" ")

  if (parts.length === 1) {
    fen = `${parts[0]} w - - 0 1`
  } else if (parts.length === 2) {
    fen = `${parts[0]} ${parts[1]} - - 0 1`
  } else if (parts.length === 4) {
    fen = `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} 0 1`
  }

  return fen
}

function extractJson(text) {
  const raw = String(text || "").trim()

  try {
    return JSON.parse(raw)
  } catch {}

  const match = raw.match(/\{[\s\S]*\}/)

  if (!match) {
    throw new Error("Model did not return JSON")
  }

  return JSON.parse(match[0])
}

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

app.get("/api/price-profile", async (_req, res) => {
  res.set(
    "Cache-Control",
    "private, no-store, max-age=0",
  )

  try {
    const {
      configuredPlans,
      getPayPalMode,
    } = await import("./paypal-subscription-core.mjs")

    const useTaxedPlans =
      String(
        process.env.PAYPAL_LOCAL_PRICE_PROFILE || "taxed",
      ).toLowerCase() !== "standard"

    const plans = configuredPlans()
    const monthlyPlanId = useTaxedPlans
      ? String(process.env.PAYPAL_PLAN_MONTHLY_TAXED || "")
      : String(process.env.PAYPAL_PLAN_MONTHLY_STANDARD || "")
    const yearlyPlanId = useTaxedPlans
      ? String(process.env.PAYPAL_PLAN_YEARLY_TAXED || "")
      : String(process.env.PAYPAL_PLAN_YEARLY_STANDARD || "")

    if (!plans.has(monthlyPlanId) || !plans.has(yearlyPlanId)) {
      throw new Error("Prices are not configured")
    }

    function displayPrice(name, fallback) {
      const raw = String(process.env[name] || "").trim()
      if (!raw) return fallback
      return raw.startsWith("$") ? raw : `$${raw}`
    }

    res.json({
      mode: getPayPalMode(),
      currency: "USD",
      monthlyPrice: useTaxedPlans
        ? displayPrice("PAYPAL_PRICE_MONTHLY_TAXED", "$10.61")
        : displayPrice("PAYPAL_PRICE_MONTHLY_STANDARD", "$8.99"),
      yearlyPrice: useTaxedPlans
        ? displayPrice("PAYPAL_PRICE_YEARLY_TAXED", "$69.62")
        : displayPrice("PAYPAL_PRICE_YEARLY_STANDARD", "$59"),
      monthlyPlanId,
      yearlyPlanId,
    })
  } catch (error) {
    res.status(500).json({
      error:
        error && error.message
          ? error.message
          : "Prices are not configured",
    })
  }
})

function localServerSupabase() {
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

async function localAuthenticatedUser(req, supabase) {
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

app.post(
  "/api/verify-paypal-subscription",
  async (req, res) => {
    try {
      const supabase = localServerSupabase()
      const user = await localAuthenticatedUser(req, supabase)

      if (!user) {
        res.status(401).json({
          error: "Authentication required",
        })
        return
      }

      const {
        verifyAndStorePayPalSubscription,
      } = await import("./paypal-subscription-core.mjs")

      const result =
        await verifyAndStorePayPalSubscription({
          subscriptionId: req.body?.subscriptionId,
          userId: user.id,
          supabase,
        })

      res.status(result.status).json(result.body)
    } catch (error) {
      console.error("PayPal verification failed", error)

      res.status(500).json({
        error:
          error && error.message
            ? error.message
            : "PayPal verification failed.",
      })
    }
  },
)

app.post(
  "/api/cancel-paypal-subscription",
  async (req, res) => {
    try {
      const supabase = localServerSupabase()
      const user = await localAuthenticatedUser(req, supabase)

      if (!user) {
        res.status(401).json({
          error: "Authentication required",
        })
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
        res.json({
          ok: true,
          alreadyCancelled: true,
          currentPeriodEnd: subscription.current_period_end,
        })
        return
      }

      const {
        cancelPayPalSubscription,
        configuredPlans,
        getPayPalSubscriptionDetails,
      } = await import("./paypal-subscription-core.mjs")

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
          error:
            "This PayPal subscription does not belong to this account.",
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
      const periodEndTime = currentPeriodEnd
        ? new Date(currentPeriodEnd).getTime()
        : 0

      let updateResult = await supabase
        .from("subscriptions")
        .update({
          status:
            Number.isFinite(periodEndTime) &&
            periodEndTime > Date.now()
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
        updateResult = await supabase
          .from("subscriptions")
          .update({
            status:
              Number.isFinite(periodEndTime) &&
              periodEndTime > Date.now()
                ? "active"
                : "cancelled",
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: true,
          })
          .eq("user_id", user.id)
      }

      if (updateResult.error) throw updateResult.error

      res.json({
        ok: true,
        currentPeriodEnd,
        cancelAtPeriodEnd: true,
      })
    } catch (error) {
      console.error("PayPal cancellation failed", error)

      res.status(500).json({
        error:
          error && error.message
            ? error.message
            : "PayPal cancellation failed.",
      })
    }
  },
)

function localPublicCoachQuota(value) {
  if (!value || typeof value !== "object") {
    return undefined
  }

  return {
    tier:
      value.tier === "premium"
        ? "premium"
        : "free",

    limit:
      Math.max(0, Number(value.limit) || 0),

    used:
      Math.max(0, Number(value.used) || 0),

    remaining:
      Math.max(0, Number(value.remaining) || 0),

    resetAt:
      value.reset_at || null,
  }
}

function localCoachUsage(result) {
  const usage =
    result?.body?.usage &&
    typeof result.body.usage === "object"
      ? result.body.usage
      : {}

  return {
    inputTokens:
      Math.max(
        0,
        Number(usage.inputTokens) || 0,
      ),

    outputTokens:
      Math.max(
        0,
        Number(usage.outputTokens) || 0,
      ),

    estimatedCostUsd:
      usage.estimatedCostUsd === null ||
      usage.estimatedCostUsd === undefined
        ? null
        : Math.max(
            0,
            Number(usage.estimatedCostUsd) || 0,
          ),
  }
}

app.post("/api/coach-explanation", async (req, res) => {
  let reservationId = ""
  let supabase
  let userId = ""

  try {
    const authorization = String(
      req.headers.authorization || "",
    )

    const accessToken =
      authorization.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : ""

    if (!accessToken) {
      res.status(401).json({
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      })

      return
    }

    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL

    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      res.status(500).json({
        error:
          "Supabase server configuration is missing.",

        code: "SERVER_AUTH_UNAVAILABLE",
      })

      return
    }

    supabase = createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )

    const userResult =
      await supabase.auth.getUser(
        accessToken,
      )

    if (
      userResult.error ||
      !userResult.data.user
    ) {
      res.status(401).json({
        error: "Invalid session",
        code: "AUTH_REQUIRED",
      })

      return
    }

    userId =
      userResult.data.user.id

    const {
      createCoachExplanation,
    } = await import(
      "./coach-explanation-core.mjs"
    )

    const ip =
      req.ip ||
      req.socket?.remoteAddress ||
      "local"

    const cacheResult =
      await createCoachExplanation(
        req.body,
        {
          userId,
          ip,
          cacheOnly: true,
        },
      )

    if (
      cacheResult.status === 200 &&
      cacheResult.body?.source === "ai" &&
      cacheResult.body?.cached === true
    ) {
      res
        .status(200)
        .json(cacheResult.body)

      return
    }

    const quotaResult =
      await supabase.rpc(
        "reserve_coach_explanation_usage",
        {
          p_user_id: userId,
        },
      )

    if (quotaResult.error) {
      throw new Error(
        `Could not reserve AI Coach usage: ${quotaResult.error.message}`,
      )
    }

    const quota =
      quotaResult.data

    if (!quota || quota.allowed !== true) {
      res.status(
        quota?.code === "AUTH_REQUIRED"
          ? 401
          : 429,
      ).json({
        error:
          quota?.tier === "premium"
            ? "You have used all 30 AI Coach explanations for this month."
            : "Your free AI Coach explanation has already been used.",

        code:
          quota?.code ||
          "COACH_QUOTA_EXCEEDED",

        quota:
          localPublicCoachQuota(quota),
      })

      return
    }

    reservationId =
      String(
        quota.reservation_id || "",
      )

    if (!reservationId) {
      throw new Error(
        "AI Coach quota reservation ID is missing.",
      )
    }

    const result =
      await createCoachExplanation(
        req.body,
        {
          userId,
          ip,
        },
      )

    if (
      result.status === 200 &&
      result.body?.source === "ai" &&
      result.body?.cached === true
    ) {
      const releaseResult =
        await supabase.rpc(
          "release_coach_explanation_usage",
          {
            p_user_id: userId,
            p_reservation_id:
              reservationId,
          },
        )

      if (releaseResult.error) {
        throw new Error(
          `Could not refund cached AI Coach usage: ${releaseResult.error.message}`,
        )
      }

      reservationId = ""

      res
        .status(200)
        .json(result.body)

      return
    }

    if (
      result.status === 200 &&
      result.body?.source === "ai"
    ) {
      const usage =
        localCoachUsage(result)

      const completeResult =
        await supabase.rpc(
          "complete_coach_explanation_usage",
          {
            p_user_id: userId,

            p_reservation_id:
              reservationId,

            p_model:
              result.body.model ||
              process.env
                .OPENAI_CHESS_COACH_MODEL ||
              "gpt-5.6-luna",

            p_input_tokens:
              usage.inputTokens,

            p_output_tokens:
              usage.outputTokens,

            p_estimated_cost_usd:
              usage.estimatedCostUsd,
          },
        )

      if (
        completeResult.error ||
        completeResult.data !== true
      ) {
        throw new Error(
          completeResult.error?.message ||
          "AI Coach usage could not be completed.",
        )
      }

      reservationId = ""

      res.status(200).json({
        ...result.body,

        quota:
          localPublicCoachQuota(quota),
      })

      return
    }

    const releaseResult =
      await supabase.rpc(
        "release_coach_explanation_usage",
        {
          p_user_id: userId,
          p_reservation_id:
            reservationId,
        },
      )

    if (releaseResult.error) {
      console.error(
        "Could not refund local AI Coach usage",
        releaseResult.error,
      )
    }

    reservationId = ""

    res
      .status(result.status)
      .json(result.body)
  } catch (error) {
    if (
      reservationId &&
      supabase &&
      userId
    ) {
      const releaseResult =
        await supabase.rpc(
          "release_coach_explanation_usage",
          {
            p_user_id: userId,
            p_reservation_id:
              reservationId,
          },
        )

      if (releaseResult.error) {
        console.error(
          "Could not refund local AI Coach usage",
          releaseResult.error,
        )
      }
    }

    console.error(
      "Local AI Coach endpoint failed",
      error,
    )

    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Could not create AI Coach explanation.",

      code: "COACH_API_ERROR",
    })
  }
})

app.post(
  "/api/image-to-position",
  upload.single("image"),
  async (req, res) => {
    try {
      const {
        convertImageToPosition,
      } = await import(
        "./image-to-position-core.mjs"
      )

      const result =
        await convertImageToPosition({
          authorization: String(
            req.headers.authorization || "",
          ),
          imageBuffer:
            req.file?.buffer || null,
          mimeType:
            req.file?.mimetype ||
            "application/octet-stream",
        })

      if (
        process.env.IMAGE_TO_POSITION_TIMING === "1" &&
        result.serverTiming
      ) {
        console.info(
          `[Image to Position] server timing: ${result.serverTiming}`,
        )
      }

      res
        .set(
          "Server-Timing",
          result.serverTiming || "",
        )
        .status(result.status)
        .json(result.body)
    } catch (error) {
      console.error(
        "Local Image to Position endpoint failed",
        error,
      )

      res.status(500).json({
        error:
          error && error.message
            ? error.message
            : "Could not process image.",
      })
    }
  },
)

app.listen(PORT, () => {
  console.log(`Chess API server listening on http://localhost:${PORT}`)
})
