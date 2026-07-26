import { supabase } from "../../lib/supabase"
import type {
  MistakeExplainInput,
  MistakeExplanation,
} from "./types"

export type CoachQuota = {
  tier: "free" | "premium"
  limit: number
  used: number
  remaining: number
  resetAt?: string | null
}

export type CoachComposeResult = {
  explanation: MistakeExplanation
  source: "ai" | "deterministic"
  reason?: string
  code?: string
  quota?: CoachQuota
  cached?: boolean
}

const memoryCache = new Map<string, CoachComposeResult>()
const CACHE_PREFIX = "weissCoachAi:v1:"
const REQUEST_TIMEOUT_MS = 12000

function stablePayload(
  input: MistakeExplainInput,
  fallback: MistakeExplanation
) {
  return {
    fenBefore: input.fenBefore,
    userMoveSan: input.userMoveSan,
    userMoveUci: input.userMoveUci,
    bestMoveSan: input.bestMoveSan,
    bestMoveUci: input.bestMoveUci,
    evalLossCp: input.evalLossCp,
    bestLineSan: input.bestLineSan || [],
    playedLineSan: input.playedLineSan || [],
    phase: input.phase,
    source: input.source,
    userColor: input.userColor,
    openingName: input.openingName,
    trainerId: input.trainerId,
    theme: input.theme,
    goal: input.goal || input.trainerGoal,
    fallback,
  }
}

function hashText(text: string): string {
  let hash = 2166136261

  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function cacheKey(
  input: MistakeExplainInput,
  fallback: MistakeExplanation
): string {
  return CACHE_PREFIX + hashText(
    JSON.stringify(stablePayload(input, fallback))
  )
}

function readSessionCache(key: string): CoachComposeResult | null {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as {
      expiresAt?: number
      result?: CoachComposeResult
    }

    if (
      !parsed.result ||
      !parsed.expiresAt ||
      parsed.expiresAt < Date.now()
    ) {
      window.sessionStorage.removeItem(key)
      return null
    }

    return parsed.result
  } catch {
    return null
  }
}

function writeSessionCache(
  key: string,
  result: CoachComposeResult
) {
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        result,
      })
    )
  } catch {
    // Session storage is only an optimization.
  }
}

function validExplanation(
  value: unknown,
  fallback: MistakeExplanation
): MistakeExplanation | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>

  const required = [
    "title",
    "explanation",
    "whyBestMoveWorks",
    "lesson",
  ]

  if (
    required.some(
      (key) =>
        typeof item[key] !== "string" ||
        !(item[key] as string).trim()
    )
  ) {
    return null
  }

  return {
    ...fallback,
    title: String(item.title).trim(),
    explanation: String(item.explanation).trim(),
    whyBestMoveWorks: String(item.whyBestMoveWorks).trim(),
    lesson: String(item.lesson).trim(),
    recommendedTrainer:
      typeof item.recommendedTrainer === "string" &&
      item.recommendedTrainer.trim()
        ? item.recommendedTrainer.trim()
        : fallback.recommendedTrainer,
    source: "ai",
  }
}

export async function composeCoachExplanation(
  input: MistakeExplainInput,
  fallback: MistakeExplanation
): Promise<CoachComposeResult> {
  if (
    fallback.confidence === "low" ||
    (!input.userMoveSan && !input.userMoveUci) ||
    (!input.bestMoveSan && !input.bestMoveUci)
  ) {
    return {
      explanation: fallback,
      source: "deterministic",
      reason:
        fallback.confidence === "low"
          ? "low_evidence_confidence"
          : "missing_verified_moves",
    }
  }

  const key = cacheKey(input, fallback)
  const memory = memoryCache.get(key)
  if (memory) return memory

  const stored = readSessionCache(key)
  if (stored) {
    memoryCache.set(key, stored)
    return stored
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  )

  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const endpoint =
      import.meta.env.VITE_CHESS_COACH_API_URL ||
      "/api/coach-explanation"

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },
      body: JSON.stringify(
        stablePayload(input, fallback)
      ),
      signal: controller.signal,
    })

    const body = (
      await response
        .json()
        .catch(() => ({}))
    ) as {
      source?: "ai" | "deterministic"
      explanation?: unknown
      reason?: string
      error?: string
      code?: string
      cached?: boolean
      quota?: {
        tier?: unknown
        limit?: unknown
        used?: unknown
        remaining?: unknown
        resetAt?: unknown
      }
    }

    const quota: CoachQuota | undefined =
      body.quota &&
      typeof body.quota === "object"
        ? {
            tier:
              body.quota.tier === "premium"
                ? "premium"
                : "free",

            limit:
              Math.max(
                0,
                Number(body.quota.limit) || 0
              ),

            used:
              Math.max(
                0,
                Number(body.quota.used) || 0
              ),

            remaining:
              Math.max(
                0,
                Number(body.quota.remaining) || 0
              ),

            resetAt:
              typeof body.quota.resetAt === "string"
                ? body.quota.resetAt
                : null,
          }
        : undefined

    if (!response.ok) {
      return {
        explanation: fallback,
        source: "deterministic",

        reason:
          body.error ||
          body.reason ||
          `Coach API returned ${response.status}`,

        code: body.code,
        quota,
      }
    }

    const explanation = validExplanation(
      body.explanation,
      fallback
    )

    const result: CoachComposeResult = explanation
      ? {
          explanation,

          source:
            body.source === "ai"
              ? "ai"
              : "deterministic",

          reason: body.reason,
          code: body.code,
          quota,
          cached: body.cached === true,
        }
      : {
          explanation: fallback,
          source: "deterministic",
          reason: "invalid_api_response",
          code: body.code,
          quota,
        }

    // Only successful AI results are cached.
    // Quota errors and temporary failures remain retryable.
    if (result.source === "ai") {
      memoryCache.set(key, result)
      writeSessionCache(key, result)
    }

    return result  } catch (error) {
    return {
      explanation: fallback,
      source: "deterministic",
      reason:
        error instanceof Error
          ? error.message
          : "coach_api_unavailable",
    }
  } finally {
    window.clearTimeout(timeout)
  }
}
