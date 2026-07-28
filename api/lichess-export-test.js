const TEST_USERNAME = "DrNykterstein"

let requestInProgress = false

function queryUsername(value) {
  const raw = Array.isArray(value) ? value[0] : value
  return String(raw || "").trim()
}

function hasString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function diagnosticFor(game) {
  const players = game && typeof game.players === "object" ? game.players : {}
  const white = players && typeof players.white === "object" ? players.white : {}
  const black = players && typeof players.black === "object" ? players.black : {}

  return {
    fieldNames: Object.keys(game || {}).sort(),
    fieldsPresent: {
      pgn: hasString(game?.pgn),
      moves: hasString(game?.moves) || Array.isArray(game?.moves),
      gameId: hasString(game?.id),
      timeControl: hasString(game?.speed) || hasString(game?.perf) || Boolean(game?.clock),
      ratings: Number.isFinite(white?.rating) || Number.isFinite(black?.rating),
      result: hasString(game?.winner) || hasString(game?.status),
    },
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0")

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const username = queryUsername(req.query?.username)
  if (username.toLowerCase() !== TEST_USERNAME.toLowerCase()) {
    res.status(400).json({
      error: `This diagnostic only supports the fixed test username ${TEST_USERNAME}`,
    })
    return
  }

  if (requestInProgress) {
    res.status(409).json({ error: "Lichess request already in progress" })
    return
  }

  requestInProgress = true

  try {
    const upstream = await fetch(
      `https://lichess.org/api/games/user/${TEST_USERNAME}?max=1`,
      {
        headers: {
          Accept: "application/x-ndjson",
          "User-Agent": "Weiss Chess Trainer / https://weisschess.com / contact: seret1234@gmail.com",
        },
      },
    )

    const contentType = String(upstream.headers.get("content-type") || "")

    if (upstream.status === 404) {
      res.status(404).json({
        status: upstream.status,
        contentType,
        error: "Lichess username not found",
      })
      return
    }

    if (upstream.status === 429) {
      res.status(429).json({
        status: upstream.status,
        contentType,
        error: "Lichess rate limit reached; wait at least 60 seconds before retrying",
      })
      return
    }

    if (!upstream.ok) {
      res.status(502).json({
        status: upstream.status,
        contentType,
        error: "Lichess export request failed",
      })
      return
    }

    const body = await upstream.text()
    const firstLine = body.split(/\r?\n/).find((line) => line.trim())

    if (!firstLine) {
      res.status(502).json({
        status: upstream.status,
        contentType,
        error: "Lichess returned an empty response",
      })
      return
    }

    let game
    try {
      game = JSON.parse(firstLine)
    } catch {
      res.status(502).json({
        status: upstream.status,
        contentType,
        error: "Lichess returned a malformed NDJSON response",
      })
      return
    }

    if (!game || typeof game !== "object" || Array.isArray(game)) {
      res.status(502).json({
        status: upstream.status,
        contentType,
        error: "Lichess returned an unexpected game object",
      })
      return
    }

    res.status(200).json({
      status: upstream.status,
      contentType,
      ...diagnosticFor(game),
    })
  } catch {
    res.status(502).json({ error: "Lichess export request could not be completed" })
  } finally {
    requestInProgress = false
  }
}
