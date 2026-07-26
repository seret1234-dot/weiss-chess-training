import { createClient } from "@supabase/supabase-js"
import { verifyAndStorePayPalSubscription } from "../server/paypal-subscription-core.mjs"

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store")

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  try {
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

    const authorization = String(
      req.headers.authorization || "",
    )

    const accessToken = authorization.startsWith(
      "Bearer ",
    )
      ? authorization.slice(7).trim()
      : ""

    if (!accessToken) {
      res.status(401).json({
        error: "Authentication required",
      })
      return
    }

    const supabase = createClient(
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
      await supabase.auth.getUser(accessToken)

    if (
      userResult.error ||
      !userResult.data.user
    ) {
      res.status(401).json({
        error: "Invalid session",
      })
      return
    }

    const subscriptionId = String(
      req.body?.subscriptionId || "",
    ).trim()

    const result =
      await verifyAndStorePayPalSubscription({
        subscriptionId,
        userId: userResult.data.user.id,
        supabase,
      })

    res.status(result.status).json(result.body)
  } catch (error) {
    console.error(
      "PayPal subscription verification failed",
      error,
    )

    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "PayPal verification failed.",
    })
  }
}
