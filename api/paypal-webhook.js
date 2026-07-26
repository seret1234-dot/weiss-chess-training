import { createVerify } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { synchronizePayPalSubscription } from "../server/paypal-subscription-core.mjs"

const certificateCache = new Map()

function requiredEnvironment(name) {
  const value = String(process.env[name] || "").trim()

  if (!value) {
    throw new Error(`Missing server environment variable: ${name}`)
  }

  return value
}

function crc32(buffer) {
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc ^= byte

    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

function trustedCertificateUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)

    if (url.protocol !== "https:") return false

    const hostname = url.hostname.toLowerCase()

    return (
      hostname === "paypal.com" ||
      hostname.endsWith(".paypal.com") ||
      hostname === "paypalobjects.com" ||
      hostname.endsWith(".paypalobjects.com")
    )
  } catch {
    return false
  }
}

async function getCertificate(rawUrl) {
  if (!trustedCertificateUrl(rawUrl)) {
    throw new Error("Untrusted PayPal certificate URL.")
  }

  if (certificateCache.has(rawUrl)) {
    return certificateCache.get(rawUrl)
  }

  const response = await fetch(rawUrl, {
    headers: { Accept: "application/x-pem-file,text/plain,*/*" },
  })

  if (!response.ok) {
    throw new Error(
      "Could not download PayPal verification certificate.",
    )
  }

  const certificate = await response.text()
  certificateCache.set(rawUrl, certificate)
  return certificate
}

async function verifyPayPalSignature(rawBody, request) {
  const webhookId = requiredEnvironment("PAYPAL_WEBHOOK_ID")
  const transmissionId =
    request.headers.get("paypal-transmission-id") || ""
  const transmissionTime =
    request.headers.get("paypal-transmission-time") || ""
  const transmissionSignature =
    request.headers.get("paypal-transmission-sig") || ""
  const certificateUrl =
    request.headers.get("paypal-cert-url") || ""
  const authAlgorithm =
    request.headers.get("paypal-auth-algo") || ""

  if (
    !transmissionId ||
    !transmissionTime ||
    !transmissionSignature ||
    !certificateUrl ||
    authAlgorithm.toUpperCase() !== "SHA256WITHRSA"
  ) {
    return false
  }

  const checksum = crc32(Buffer.from(rawBody, "utf8"))
  const signedMessage =
    `${transmissionId}|${transmissionTime}|${webhookId}|${checksum}`
  const certificate = await getCertificate(certificateUrl)
  const verifier = createVerify("SHA256")
  verifier.update(signedMessage)
  verifier.end()

  return verifier.verify(
    certificate,
    Buffer.from(transmissionSignature, "base64"),
  )
}

function subscriptionIdFromEvent(event) {
  const resource = event?.resource || {}
  const candidates = [
    resource.billing_agreement_id,
    resource.subscription_id,
    resource.supplementary_data?.related_ids
      ?.billing_agreement_id,
    resource.supplementary_data?.related_ids
      ?.subscription_id,
    /^I-[A-Z0-9]+$/i.test(String(resource.id || ""))
      ? resource.id
      : null,
  ]

  return (
    candidates
      .map((value) => String(value || "").trim())
      .find((value) => /^I-[A-Z0-9]+$/i.test(value)) ||
    null
  )
}

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

const supportedEvents = new Set([
  "BILLING.SUBSCRIPTION.CREATED",
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.REFUNDED",
  "PAYMENT.SALE.REVERSED",
])

async function claimEvent(supabase, event) {
  const eventId = String(event.id || "").trim()

  if (!/^WH-[A-Z0-9-]+$/i.test(eventId)) {
    throw new Error("PayPal webhook event ID is invalid.")
  }

  const existing = await supabase
    .from("paypal_webhook_events")
    .select("event_id,processed_at,attempt_count")
    .eq("event_id", eventId)
    .maybeSingle()

  const missingTable =
    existing.error &&
    (existing.error.code === "PGRST205" ||
      existing.error.code === "42P01")

  if (existing.error && !missingTable) {
    throw existing.error
  }

  // Migration not applied yet: continue safely, but without dedupe.
  if (missingTable) {
    return {
      eventId,
      tableAvailable: false,
      duplicate: false,
    }
  }

  if (existing.data?.processed_at) {
    return {
      eventId,
      tableAvailable: true,
      duplicate: true,
    }
  }

  const row = {
    event_id: eventId,
    event_type: String(event.event_type || ""),
    resource_id: String(event.resource?.id || "") || null,
    event_created_at: event.create_time || null,
    received_at: new Date().toISOString(),
    attempt_count:
      Math.max(0, Number(existing.data?.attempt_count) || 0) + 1,
    last_error: null,
  }

  const result = existing.data
    ? await supabase
        .from("paypal_webhook_events")
        .update(row)
        .eq("event_id", eventId)
    : await supabase
        .from("paypal_webhook_events")
        .insert(row)

  if (result.error) throw result.error

  return {
    eventId,
    tableAvailable: true,
    duplicate: false,
  }
}

async function markProcessed(supabase, claim) {
  if (!claim?.tableAvailable) return

  const result = await supabase
    .from("paypal_webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("event_id", claim.eventId)

  if (result.error) throw result.error
}

async function markFailed(supabase, claim, error) {
  if (!claim?.tableAvailable) return

  await supabase
    .from("paypal_webhook_events")
    .update({
      last_error: String(
        error instanceof Error ? error.message : error,
      ).slice(0, 2000),
    })
    .eq("event_id", claim.eventId)
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json(
        { error: "Method not allowed" },
        {
          status: 405,
          headers: {
            Allow: "POST",
            "Cache-Control": "no-store",
          },
        },
      )
    }

    let supabase = null
    let claim = null

    try {
      const rawBody = await request.text()
      const signatureIsValid =
        await verifyPayPalSignature(rawBody, request)

      if (!signatureIsValid) {
        return Response.json(
          { error: "Invalid PayPal signature" },
          {
            status: 401,
            headers: { "Cache-Control": "no-store" },
          },
        )
      }

      const event = JSON.parse(rawBody)
      const eventType = String(event.event_type || "")
      supabase = serverSupabase()
      claim = await claimEvent(supabase, event)

      if (claim.duplicate) {
        return Response.json(
          {
            ok: true,
            duplicate: true,
            eventType,
          },
          {
            status: 200,
            headers: { "Cache-Control": "no-store" },
          },
        )
      }

      if (!supportedEvents.has(eventType)) {
        await markProcessed(supabase, claim)

        return Response.json(
          {
            ok: true,
            ignored: true,
            eventType,
          },
          {
            status: 200,
            headers: { "Cache-Control": "no-store" },
          },
        )
      }

      const subscriptionId = subscriptionIdFromEvent(event)

      if (!subscriptionId) {
        throw new Error(
          "PayPal event did not contain a subscription ID.",
        )
      }

      const result = await synchronizePayPalSubscription({
        eventType,
        subscriptionId,
        supabase,
      })

      await markProcessed(supabase, claim)

      return Response.json(
        {
          ok: true,
          eventType,
          subscriptionId,
          status: result.status || null,
          ignored: Boolean(result.ignored),
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        },
      )
    } catch (error) {
      console.error("PayPal webhook failed", error)

      if (supabase && claim) {
        await markFailed(supabase, claim, error).catch(() => {})
      }

      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "PayPal webhook failed.",
        },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        },
      )
    }
  },
}
