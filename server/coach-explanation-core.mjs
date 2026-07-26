import crypto from "node:crypto"
import OpenAI from "openai"
import { Chess } from "chess.js"

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT = 60
const cache = new Map()
const rateBuckets = new Map()

function cleanText(value, max = 600) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max)
}

function stableHash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
}

function pruneMaps() {
  const now = Date.now()

  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key)
  }

  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key)
  }
}

function consumeRateLimit(key) {
  pruneMaps()
  const now = Date.now()
  const current = rateBuckets.get(key)

  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, {
      count: 1,
      resetAt: now + RATE_WINDOW_MS,
    })
    return true
  }

  if (current.count >= RATE_LIMIT) return false
  current.count += 1
  return true
}

function normalizeMoveToken(value) {
  return cleanText(value, 30)
    .replace(/0/g, "O")
    .replace(/[!?]+/g, "")
}

function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion || ""}`.toLowerCase()
}

function playMove(chess, text) {
  const token = normalizeMoveToken(text)
  if (!token) return null

  try {
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(token)) {
      return chess.move({
        from: token.slice(0, 2).toLowerCase(),
        to: token.slice(2, 4).toLowerCase(),
        promotion:
          token.length > 4 ? token.slice(4, 5).toLowerCase() : undefined,
      })
    }

    return chess.move(token)
  } catch {
    return null
  }
}

function verifySingleMove(fen, san, uci) {
  const chess = new Chess(fen)
  const move = playMove(chess, uci || san)

  if (!move) return null

  return {
    san: move.san,
    uci: moveToUci(move),
    fenAfter: chess.fen(),
  }
}

function verifyLine(fen, supplied) {
  const chess = new Chess(fen)
  const san = []
  const uci = []
  let complete = true

  for (const token of Array.isArray(supplied) ? supplied.slice(0, 12) : []) {
    const move = playMove(chess, token)

    if (!move) {
      complete = false
      break
    }

    san.push(move.san)
    uci.push(moveToUci(move))
  }

  return {
    supplied: Array.isArray(supplied) ? supplied.slice(0, 12) : [],
    san,
    uci,
    complete,
    finalFen: chess.fen(),
    terminal: chess.isCheckmate()
      ? "checkmate"
      : chess.isDraw()
      ? "draw"
      : "ongoing",
  }
}

function sameMove(a, b) {
  if (!a || !b) return false
  return (
    a.uci === b.uci ||
    normalizeMoveToken(a.san).replace(/[+#]$/g, "") ===
      normalizeMoveToken(b.san).replace(/[+#]$/g, "")
  )
}

function normalizeFallback(value) {
  const fallback = value && typeof value === "object" ? value : {}

  return {
    title: cleanText(fallback.title, 120) || "Move explanation",
    severity: cleanText(fallback.severity, 30) || "mistake",
    mistakeType: cleanText(fallback.mistakeType, 50) || "generic",
    evalLossCp: Number.isFinite(Number(fallback.evalLossCp))
      ? Number(fallback.evalLossCp)
      : 0,
    explanation:
      cleanText(fallback.explanation, 700) ||
      "The played move was less accurate than the engine choice.",
    whyBestMoveWorks:
      cleanText(fallback.whyBestMoveWorks, 700) ||
      "The engine move avoids the concrete problem.",
    lesson:
      cleanText(fallback.lesson, 500) ||
      "Compare the opponent's strongest reply before moving.",
    recommendedTrainer: cleanText(fallback.recommendedTrainer, 120) || undefined,
    facts: Array.isArray(fallback.facts)
      ? fallback.facts.slice(0, 20).map((item) => cleanText(item, 300))
      : [],
    confidence:
      fallback.confidence === "high" || fallback.confidence === "medium"
        ? fallback.confidence
        : "low",
    evidence:
      fallback.evidence && typeof fallback.evidence === "object"
        ? fallback.evidence
        : undefined,
    source: "deterministic",
  }
}

function deterministicResult(fallback, reason) {
  return {
    ok: true,
    source: "deterministic",
    explanation: {
      ...fallback,
      source: "deterministic",
    },
    reason,
  }
}

function validateRequest(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object")
  }

  const fenBefore = cleanText(body.fenBefore, 120)
  if (!fenBefore) throw new Error("fenBefore is required")

  const position = new Chess(fenBefore)
  const canonicalFen = position.fen()
  const fallback = normalizeFallback(body.fallback)
  const userMove = verifySingleMove(
    canonicalFen,
    body.userMoveSan,
    body.userMoveUci,
  )
  const bestMove = verifySingleMove(
    canonicalFen,
    body.bestMoveSan,
    body.bestMoveUci,
  )

  if (!userMove) throw new Error("The played move is not legal")
  if (!bestMove) throw new Error("The best move is not legal")

  const bestLine = verifyLine(canonicalFen, body.bestLineSan)
  const playedLine = verifyLine(canonicalFen, body.playedLineSan)

  if (
    bestLine.san.length > 0 &&
    !sameMove(bestMove, {
      san: bestLine.san[0],
      uci: bestLine.uci[0],
    })
  ) {
    throw new Error("The best line does not begin with the best move")
  }

  if (
    playedLine.san.length > 0 &&
    !sameMove(userMove, {
      san: playedLine.san[0],
      uci: playedLine.uci[0],
    })
  ) {
    throw new Error("The played line does not begin with the played move")
  }

  return {
    fenBefore: canonicalFen,
    userMove,
    bestMove,
    bestLine,
    playedLine,
    evalLossCp: Math.max(0, Math.min(1000, Number(body.evalLossCp) || 0)),
    phase: ["opening", "middlegame", "endgame"].includes(body.phase)
      ? body.phase
      : "middlegame",
    source: cleanText(body.source, 30),
    userColor: body.userColor === "black" ? "black" : "white",
    openingName: cleanText(body.openingName, 120),
    trainerId: cleanText(body.trainerId, 80),
    theme: cleanText(body.theme, 100),
    goal: cleanText(body.goal, 250),
    fallback,
  }
}

function compactEvidence(fallback) {
  const evidence = fallback.evidence || {}
  const tactical = Array.isArray(evidence.tactical)
    ? evidence.tactical.slice(0, 6).map((item) => ({
        tag: cleanText(item.tag, 50),
        confidence: cleanText(item.confidence, 20),
        summary: cleanText(item.summary, 300),
        proofMoves: Array.isArray(item.proofMoves)
          ? item.proofMoves.slice(0, 8).map((move) => cleanText(move, 30))
          : [],
        square: cleanText(item.square, 10) || null,
        targets: Array.isArray(item.targets)
          ? item.targets.slice(0, 8).map((target) => cleanText(target, 80))
          : [],
      }))
    : []

  const positional = Array.isArray(evidence.positional)
    ? evidence.positional.slice(0, 6).map((item) => ({
        tag: cleanText(item.tag, 50),
        confidence: cleanText(item.confidence, 20),
        summary: cleanText(item.summary, 300),
        proofMoves: Array.isArray(item.proofMoves)
          ? item.proofMoves.slice(0, 8).map((move) => cleanText(move, 30))
          : [],
        squares: Array.isArray(item.squares)
          ? item.squares.slice(0, 12).map((square) => cleanText(square, 10))
          : [],
      }))
    : []

  return {
    confidence: cleanText(evidence.confidence, 20),
    primaryTag: cleanText(evidence.primaryTag, 50),
    tactical,
    positional,
  }
}

function allowedMoveSet(validated) {
  const evidence =
    validated.fallback.evidence || {}

  const tactical =
    Array.isArray(evidence.tactical)
      ? evidence.tactical
      : []

  const positional =
    Array.isArray(evidence.positional)
      ? evidence.positional
      : []

  const proofMoves = [
    ...tactical.flatMap((item) =>
      Array.isArray(item.proofMoves)
        ? item.proofMoves
        : [],
    ),

    ...positional.flatMap((item) =>
      Array.isArray(item.proofMoves)
        ? item.proofMoves
        : [],
    ),
  ]

  const evidenceSquares = [
    ...tactical.flatMap((item) => [
      item.square,

      ...(Array.isArray(item.targets)
        ? item.targets.flatMap(
            (target) =>
              String(target || "").match(
                /[a-h][1-8]/g,
              ) || [],
          )
        : []),
    ]),

    ...positional.flatMap((item) =>
      Array.isArray(item.squares)
        ? item.squares
        : [],
    ),
  ].filter(Boolean)

  const values = [
    validated.userMove.san,
    validated.userMove.uci,

    validated.bestMove.san,
    validated.bestMove.uci,

    ...validated.bestLine.san,
    ...validated.bestLine.uci,

    ...validated.playedLine.san,
    ...validated.playedLine.uci,

    ...proofMoves,
    ...evidenceSquares,
  ]

  return new Set(
    values
      .filter(Boolean)
      .flatMap((value) => {
        const normalized =
          normalizeMoveToken(value)

        return [
          normalized,

          normalized.replace(
            /[+#]$/g,
            "",
          ),

          normalized.toLowerCase(),
        ]
      }),
  )
}
function moveReferencesInText(text) {
  const matches = String(text || "").match(
    /\b(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8][a-h][1-8][qrbn]?)\b/g,
  )

  return matches || []
}

function validateModelResult(parsed, validated) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The model did not return an object")
  }

  const required = [
    "title",
    "explanation",
    "whyBestMoveWorks",
    "lesson",
  ]

  for (const field of required) {
    if (!cleanText(parsed[field], 1000)) {
      throw new Error(`The model omitted ${field}`)
    }
  }

  const allowed = allowedMoveSet(validated)
  const declared = Array.isArray(parsed.referencedMoves)
    ? parsed.referencedMoves.map((move) => normalizeMoveToken(move))
    : []

  const prose = [
    parsed.title,
    parsed.explanation,
    parsed.whyBestMoveWorks,
    parsed.lesson,
  ].join(" ")

  const references = [
    ...declared,
    ...moveReferencesInText(prose),
  ]

  for (const reference of references) {
    const normalized = normalizeMoveToken(reference)
    const stripped = normalized.replace(/[+#]$/g, "")

    if (
      normalized &&
      !allowed.has(normalized) &&
      !allowed.has(stripped) &&
      !allowed.has(normalized.toLowerCase())
    ) {
      throw new Error(`The model referenced an unverified move: ${reference}`)
    }
  }

  return {
    ...validated.fallback,
    title: cleanText(parsed.title, 120),
    explanation: cleanText(parsed.explanation, 700),
    whyBestMoveWorks: cleanText(parsed.whyBestMoveWorks, 700),
    lesson: cleanText(parsed.lesson, 500),
    recommendedTrainer:
      cleanText(parsed.recommendedTrainer, 120) ||
      validated.fallback.recommendedTrainer,
    source: "ai",
  }
}

const outputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 120 },
    explanation: { type: "string", minLength: 1, maxLength: 700 },
    whyBestMoveWorks: { type: "string", minLength: 1, maxLength: 700 },
    lesson: { type: "string", minLength: 1, maxLength: 500 },
    recommendedTrainer: {
      anyOf: [
        { type: "string", maxLength: 120 },
        { type: "null" },
      ],
    },
    referencedMoves: {
      type: "array",
      maxItems: 16,
      items: { type: "string", maxLength: 30 },
    },
  },
  required: [
    "title",
    "explanation",
    "whyBestMoveWorks",
    "lesson",
    "recommendedTrainer",
    "referencedMoves",
  ],
}

function buildPrompt(validated) {
  const evidence = compactEvidence(validated.fallback)

  return {
    rules: [
      "You are a chess explanation editor, not a chess engine.",
      "Use only the verified facts and verified move lines below.",
      "Never invent a move, variation, threat, capture, square, evaluation, or strategic claim.",
      "Do not repeat the best move as if a one-move line were a continuation.",
      "Explain the human reason for the mistake in clear coaching language.",
      "Use no more than two short sentences per field.",
      "When evidence is positional, distinguish it from a forced tactical sequence.",
      "Put every chess move mentioned in referencedMoves.",
    ],
    position: {
      fenBefore: validated.fenBefore,
      phase: validated.phase,
      openingName: validated.openingName || null,
      userColor: validated.userColor,
    },
    moveComparison: {
      playedMove: validated.userMove.san,
      bestMove: validated.bestMove.san,
      evaluationLossScore: validated.evalLossCp,
      bestLine: validated.bestLine.san,
      bestLineComplete: validated.bestLine.complete,
      playedConsequenceLine: validated.playedLine.san,
      playedLineComplete: validated.playedLine.complete,
    },
    verifiedEvidence: evidence,
    deterministicDraft: {
      title: validated.fallback.title,
      explanation: validated.fallback.explanation,
      whyBestMoveWorks: validated.fallback.whyBestMoveWorks,
      lesson: validated.fallback.lesson,
      recommendedTrainer:
        validated.fallback.recommendedTrainer || null,
    },
    trainingContext: {
      trainerId: validated.trainerId || null,
      theme: validated.theme || null,
      goal: validated.goal || null,
    },
  }
}

export async function createCoachExplanation(body, context = {}) {
  let validated

  try {
    validated = validateRequest(body)
  } catch (error) {
    const fallback =
      normalizeFallback(body?.fallback)

    return {
      status: 400,

      body: deterministicResult(
        fallback,

        error instanceof Error
          ? error.message
          : "invalid_request",
      ),
    }
  }

  if (validated.fallback.confidence === "low") {
    return {
      status: 200,

      body: deterministicResult(
        validated.fallback,
        "low_evidence_confidence",
      ),
    }
  }

  const model =
    process.env.OPENAI_CHESS_COACH_MODEL ||
    "gpt-5.6-luna"

  const cacheKey = stableHash({
    model,
    validated,
  })

  const cached =
    cache.get(cacheKey)

  if (
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return {
      status: 200,

      body: {
        ...cached.value,
        cached: true,

        usage: {
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        },
      },
    }
  }

  // Endpoints use this before reserving quota.
  // A cache miss is not an error and does not call OpenAI.
  if (context.cacheOnly === true) {
    return {
      status: 204,

      body: {
        ok: false,
        cacheMiss: true,
      },
    }
  }

  const limiterKey = cleanText(
    context.userId ||
      context.ip ||
      "anonymous",

    200,
  )

  if (!consumeRateLimit(limiterKey)) {
    return {
      status: 200,

      body: deterministicResult(
        validated.fallback,
        "rate_limited",
      ),
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      status: 200,

      body: deterministicResult(
        validated.fallback,
        "OPENAI_API_KEY_missing",
      ),
    }
  }

  try {
    const client = new OpenAI({
      apiKey:
        process.env.OPENAI_API_KEY,
    })

    const response =
      await client.responses.create({
        model,
        store: false,

        reasoning: {
          effort: "none",
        },

        max_output_tokens: 700,

        input: [
          {
            role: "system",

            content: [
              {
                type: "input_text",

                text:
                  "Rewrite verified chess-engine evidence into a concise human coaching explanation. Never perform independent chess analysis.",
              },
            ],
          },
          {
            role: "user",

            content: [
              {
                type: "input_text",

                text: JSON.stringify(
                  buildPrompt(validated),
                ),
              },
            ],
          },
        ],

        text: {
          format: {
            type: "json_schema",

            name:
              "verified_chess_coach_explanation",

            strict: true,
            schema: outputSchema,
          },
        },
      })

    const parsed = JSON.parse(
      response.output_text || "{}",
    )

    const explanation =
      validateModelResult(
        parsed,
        validated,
      )

    const responseUsage =
      response.usage &&
      typeof response.usage === "object"
        ? response.usage
        : {}

    const inputTokens =
      Math.max(
        0,

        Number(
          responseUsage.input_tokens ??
          responseUsage.inputTokens ??
          0,
        ) || 0,
      )

    const outputTokens =
      Math.max(
        0,

        Number(
          responseUsage.output_tokens ??
          responseUsage.outputTokens ??
          0,
        ) || 0,
      )

    const estimatedCostUsd =
      model === "gpt-5.6-luna"
        ? Number(
            (
              inputTokens / 1_000_000 +
              outputTokens * 6 / 1_000_000
            ).toFixed(8),
          )
        : null

    const value = {
      ok: true,
      source: "ai",
      explanation,
      model,
      cached: false,

      usage: {
        inputTokens,
        outputTokens,
        estimatedCostUsd,
      },
    }

    cache.set(cacheKey, {
      value,

      expiresAt:
        Date.now() + CACHE_TTL_MS,
    })

    return {
      status: 200,
      body: value,
    }
  } catch (error) {
    console.error(
      "AI Coach generation or validation failed:",
      error instanceof Error
        ? error.message
        : String(error),
    )

    return {
      status: 200,

      body: {
        ...deterministicResult(
          validated.fallback,

          error instanceof Error
            ? `ai_validation_fallback: ${error.message}`
            : "ai_validation_fallback",
        ),

        code: "COACH_AI_FALLBACK",
      },
    }
  }
}