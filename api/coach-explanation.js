import { createClient } from "@supabase/supabase-js"
import { createCoachExplanation } from "../server/coach-explanation-core.mjs"

function clientIp(req) {
  const forwarded = String(
    req.headers["x-forwarded-for"] || "",
  )

  return (
    forwarded.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  )
}

function publicQuota(value) {
  if (!value || typeof value !== "object") {
    return undefined
  }

  return {
    tier:
      value.tier === "premium"
        ? "premium"
        : "free",

    limit:
      Math.max(
        0,
        Number(value.limit) || 0,
      ),

    used:
      Math.max(
        0,
        Number(value.used) || 0,
      ),

    remaining:
      Math.max(
        0,
        Number(value.remaining) || 0,
      ),

    resetAt:
      value.reset_at || null,
  }
}

function resultUsage(result) {
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

async function authenticate(req) {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return {
      status: 500,

      error:
        "Server authentication is not configured.",
    }
  }

  const authorization = String(
    req.headers.authorization || "",
  )

  const token =
    authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : ""

  if (!token) {
    return {
      status: 401,
      error: "Authentication required",
    }
  }

  const supabase = createClient(
    url,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

  const { data, error } =
    await supabase.auth.getUser(token)

  if (error || !data.user) {
    return {
      status: 401,
      error: "Invalid session",
    }
  }

  return {
    userId: data.user.id,
    supabase,
  }
}

async function reserveQuota(
  supabase,
  userId,
) {
  const { data, error } =
    await supabase.rpc(
      "reserve_coach_explanation_usage",
      {
        p_user_id: userId,
      },
    )

  if (error) {
    throw new Error(
      `Could not reserve AI Coach usage: ${error.message}`,
    )
  }

  return data
}

async function completeQuota({
  supabase,
  userId,
  reservationId,
  model,
  inputTokens,
  outputTokens,
  estimatedCostUsd,
}) {
  const { data, error } =
    await supabase.rpc(
      "complete_coach_explanation_usage",
      {
        p_user_id: userId,

        p_reservation_id:
          reservationId,

        p_model:
          model || null,

        p_input_tokens:
          inputTokens,

        p_output_tokens:
          outputTokens,

        p_estimated_cost_usd:
          estimatedCostUsd,
      },
    )

  if (error) {
    throw new Error(
      `Could not complete AI Coach usage: ${error.message}`,
    )
  }

  return data === true
}

async function releaseQuota(
  supabase,
  userId,
  reservationId,
) {
  if (!reservationId) return

  const { error } =
    await supabase.rpc(
      "release_coach_explanation_usage",
      {
        p_user_id: userId,

        p_reservation_id:
          reservationId,
      },
    )

  if (error) {
    console.error(
      "Could not release AI Coach usage",
      error,
    )
  }
}

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "no-store",
  )

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")

    res.status(405).json({
      error: "Method not allowed",
    })

    return
  }

  let reservationId = ""
  let auth

  try {
    auth = await authenticate(req)

    if (auth.error) {
      res
        .status(auth.status || 401)
        .json({
          error: auth.error,

          code:
            auth.status === 401
              ? "AUTH_REQUIRED"
              : "SERVER_AUTH_UNAVAILABLE",
        })

      return
    }

    const ip =
      clientIp(req)

    // Cached results are free and do not reserve quota.
    const cacheResult =
      await createCoachExplanation(
        req.body,
        {
          userId: auth.userId,
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

    const quota =
      await reserveQuota(
        auth.supabase,
        auth.userId,
      )

    if (
      !quota ||
      quota.allowed !== true
    ) {
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
          publicQuota(quota),
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
          userId: auth.userId,
          ip,
        },
      )

    // Another request may have populated the cache
    // between the preflight and the full call.
    if (
      result.status === 200 &&
      result.body?.source === "ai" &&
      result.body?.cached === true
    ) {
      await releaseQuota(
        auth.supabase,
        auth.userId,
        reservationId,
      )

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
        resultUsage(result)

      const completed =
        await completeQuota({
          supabase:
            auth.supabase,

          userId:
            auth.userId,

          reservationId,

          model:
            result.body.model ||
            process.env
              .OPENAI_CHESS_COACH_MODEL ||
            "gpt-5.6-luna",

          inputTokens:
            usage.inputTokens,

          outputTokens:
            usage.outputTokens,

          estimatedCostUsd:
            usage.estimatedCostUsd,
        })

      if (!completed) {
        throw new Error(
          "AI Coach usage could not be completed.",
        )
      }

      reservationId = ""

      res.status(200).json({
        ...result.body,

        quota:
          publicQuota(quota),
      })

      return
    }

    await releaseQuota(
      auth.supabase,
      auth.userId,
      reservationId,
    )

    reservationId = ""

    res
      .status(result.status)
      .json(result.body)
  } catch (error) {
    if (
      reservationId &&
      auth?.supabase &&
      auth?.userId
    ) {
      await releaseQuota(
        auth.supabase,
        auth.userId,
        reservationId,
      )
    }

    console.error(
      "AI Coach endpoint failed",
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
}