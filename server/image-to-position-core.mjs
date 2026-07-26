import OpenAI from "openai"
import { Chess } from "chess.js"
import { createClient } from "@supabase/supabase-js"

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const DEVELOPMENT_TIMING_ENABLED =
  process.env.IMAGE_TO_POSITION_TIMING === "1"

function elapsedMs(startedAt) {
  return performance.now() - startedAt
}

function serverTimingHeader(timings) {
  if (!DEVELOPMENT_TIMING_ENABLED) return ""

  return Object.entries(timings)
    .filter(([, duration]) => Number.isFinite(duration))
    .map(([name, duration]) =>
      `${name};dur=${Math.max(0, Number(duration)).toFixed(1)}`,
    )
    .join(", ")
}

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

function requiredEnvironment(name, alternatives = []) {
  for (const candidate of [name, ...alternatives]) {
    const value = String(process.env[candidate] || "").trim()

    if (value) {
      return value
    }
  }

  throw new Error(
    `Missing server environment variable: ${name}`,
  )
}

function createServerSupabase() {
  const url = requiredEnvironment(
    "SUPABASE_URL",
    ["VITE_SUPABASE_URL"],
  )

  const serviceRoleKey = requiredEnvironment(
    "SUPABASE_SERVICE_ROLE_KEY",
  )

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function extractAccessToken(authorization) {
  const value = String(authorization || "")

  if (!value.startsWith("Bearer ")) {
    return ""
  }

  return value.slice(7).trim()
}

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
    throw new HttpError(
      422,
      "The image could not be converted into a chess position.",
    )
  }

  try {
    return JSON.parse(match[0])
  } catch {
    throw new HttpError(
      422,
      "The image recognition result was invalid.",
    )
  }
}

function normalizeQuota(rawQuota) {
  return {
    tier: String(rawQuota?.tier || "free"),
    limit: Number(rawQuota?.limit || 0),
    used: Number(rawQuota?.used || 0),
    remaining: Number(rawQuota?.remaining || 0),
    resetAt: rawQuota?.reset_at || null,
  }
}

async function authenticateUser(supabase, authorization) {
  const accessToken = extractAccessToken(authorization)

  if (!accessToken) {
    throw new HttpError(
      401,
      "Log in to use Image to Position.",
      { code: "AUTH_REQUIRED" },
    )
  }

  const result =
    await supabase.auth.getUser(accessToken)

  if (result.error || !result.data.user) {
    throw new HttpError(
      401,
      "Your login session is no longer valid. Please log in again.",
      { code: "INVALID_SESSION" },
    )
  }

  return result.data.user
}

async function reserveQuota(supabase, userId) {
  const { data, error } = await supabase.rpc(
    "reserve_image_to_position_usage",
    {
      p_user_id: userId,
    },
  )

  if (error) {
    throw new Error(
      `Could not check Image to Position allowance: ${error.message}`,
    )
  }

  if (!data?.allowed) {
    const quota = normalizeQuota(data)

    const message =
      quota.tier === "premium"
        ? "You have used today's 5 Image to Position conversions. Try again after the daily reset."
        : "Your free Image to Position conversion has been used. Free accounts receive one conversion every 7 days."

    throw new HttpError(
      429,
      message,
      {
        code: "IMAGE_QUOTA_EXCEEDED",
        quota,
      },
    )
  }

  return {
    reservationId: String(data.reservation_id),
    quota: normalizeQuota(data),
  }
}

async function releaseQuota(
  supabase,
  userId,
  reservationId,
) {
  if (!reservationId) return

  const { error } = await supabase.rpc(
    "release_image_to_position_usage",
    {
      p_user_id: userId,
      p_reservation_id: reservationId,
    },
  )

  if (error) {
    console.error(
      "Could not release image quota reservation",
      error,
    )
  }
}

async function completeQuota(
  supabase,
  userId,
  reservationId,
) {
  const { data, error } = await supabase.rpc(
    "complete_image_to_position_usage",
    {
      p_user_id: userId,
      p_reservation_id: reservationId,
    },
  )

  if (error || data !== true) {
    throw new Error(
      error?.message ||
        "Could not record Image to Position usage.",
    )
  }
}

function validateImage(imageBuffer, mimeType) {
  if (!imageBuffer || imageBuffer.length === 0) {
    throw new HttpError(
      400,
      "No image was uploaded.",
    )
  }

  if (imageBuffer.length > MAX_IMAGE_BYTES) {
    throw new HttpError(
      413,
      "The image is larger than the 8 MB limit.",
    )
  }

  if (!String(mimeType || "").startsWith("image/")) {
    throw new HttpError(
      415,
      "Please upload an image file.",
    )
  }
}

async function recognizePosition(
  imageBuffer,
  mimeType,
  timings,
) {
  const modelStartedAt = performance.now()
  const apiKey = requiredEnvironment(
    "OPENAI_API_KEY",
  )

  const client = new OpenAI({ apiKey })

  const base64 =
    Buffer.from(imageBuffer).toString("base64")

  const dataUrl =
    `data:${mimeType || "image/png"};base64,${base64}`

  const model =
    process.env.OPENAI_VISION_MODEL ||
    "gpt-5.5"

  const prompt = `
You are reading a chessboard screenshot and converting it to FEN.

Return ONLY JSON with this shape:
{
  "fen": "full legal FEN with side, castling, en-passant, halfmove, fullmove",
  "orientation": "white" or "black" or "unknown",
  "confidence": 0 to 1,
  "notes": "short note"
}

Rules:
- Identify pieces by square.
- If coordinates are visible, use them.
- If board orientation is unclear, infer the likely orientation and return "unknown".
- If side to move is not visible, use "w".
- If castling rights are not visible, use "-".
- Use en-passant "-".
- Use halfmove 0 and fullmove 1 unless clear.
- The result must contain exactly one white king and one black king.
- Prefer valid FEN over explanation.
- Do not include markdown.
`

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt,
          },
          {
            type: "input_image",
            image_url: dataUrl,
            detail: "high",
          },
        ],
      },
    ],
  })
  timings.model = elapsedMs(modelStartedAt)

  const fenStartedAt = performance.now()
  const parsed =
    extractJson(response.output_text || "")

  const fen = normalizeFen(parsed.fen)

  let chess

  try {
    chess = new Chess(fen)
  } catch {
    throw new HttpError(
      422,
      "The detected board was not a valid chess position. Your allowance was not used.",
    )
  }

  timings.fen = elapsedMs(fenStartedAt)

  return {
    fen: chess.fen(),
    orientation:
      parsed.orientation === "black" ||
      parsed.orientation === "white"
        ? parsed.orientation
        : "white",
    confidence:
      typeof parsed.confidence === "number"
        ? parsed.confidence
        : 0.5,
    notes: String(parsed.notes || ""),
    model,
  }
}

export async function convertImageToPosition({
  authorization,
  imageBuffer,
  mimeType,
}) {
  const totalStartedAt = performance.now()
  const timings = {}
  let supabase
  let user
  let reservationId = ""

  try {
    validateImage(imageBuffer, mimeType)

    supabase = createServerSupabase()
    const authStartedAt = performance.now()
    user = await authenticateUser(
      supabase,
      authorization,
    )
    timings.auth = elapsedMs(authStartedAt)

    const quotaStartedAt = performance.now()
    const reservation =
      await reserveQuota(supabase, user.id)
    timings.quota = elapsedMs(quotaStartedAt)

    reservationId = reservation.reservationId

    const position = await recognizePosition(
      imageBuffer,
      mimeType,
      timings,
    )

    const completeStartedAt = performance.now()
    await completeQuota(
      supabase,
      user.id,
      reservationId,
    )
    timings.complete = elapsedMs(completeStartedAt)
    timings.total = elapsedMs(totalStartedAt)

    return {
      status: 200,
      body: {
        ok: true,
        ...position,
        quota: reservation.quota,
      },
      serverTiming: serverTimingHeader(timings),
    }
  } catch (error) {
    if (
      supabase &&
      user &&
      reservationId
    ) {
      await releaseQuota(
        supabase,
        user.id,
        reservationId,
      )
    }

    if (error instanceof HttpError) {
      timings.total = elapsedMs(totalStartedAt)
      return {
        status: error.status,
        body: {
          error: error.message,
          ...error.extra,
        },
        serverTiming: serverTimingHeader(timings),
      }
    }

    console.error(
      "Image to Position failed",
      error,
    )

    timings.total = elapsedMs(totalStartedAt)
    return {
      status: 500,
      body: {
        error:
          error instanceof Error
            ? error.message
          : "Could not convert image to position.",
      },
      serverTiming: serverTimingHeader(timings),
    }
  }
}
