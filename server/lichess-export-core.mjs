export const LICHESS_EXPORT_USER_AGENT =
  "Weiss Chess Trainer / https://weisschess.com / contact: seret1234@gmail.com"

export class LichessExportError extends Error {
  constructor(message, status = 502, code = "upstream_error") {
    super(message)
    this.name = "LichessExportError"
    this.status = status
    this.code = code
  }
}

export function normalizeLichessUsername(value) {
  const username = String(value || "").trim()
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(username)) {
    throw new LichessExportError("Enter a valid Lichess username.", 400, "invalid_username")
  }
  return username
}

export async function fetchLichessExport(username, { fetchImpl = fetch, max = 150 } = {}) {
  const safeUsername = normalizeLichessUsername(username)
  const safeMax = Math.max(1, Math.min(150, Number(max) || 150))
  const response = await fetchImpl(
    `https://lichess.org/api/games/user/${encodeURIComponent(safeUsername)}?max=${safeMax}`,
    {
      headers: {
        Accept: "application/x-ndjson",
        "User-Agent": LICHESS_EXPORT_USER_AGENT,
      },
    },
  )

  const contentType = String(response.headers?.get?.("content-type") || "")
  if (response.status === 404) {
    throw new LichessExportError("Lichess username was not found.", 404, "username_not_found")
  }
  if (response.status === 429) {
    throw new LichessExportError(
      "Lichess rate limit reached. Please wait at least 60 seconds before trying again.",
      429,
      "rate_limited",
    )
  }
  if (!response.ok) {
    throw new LichessExportError(
      `Lichess export failed (HTTP ${response.status}).`,
      502,
      "upstream_error",
    )
  }

  const body = await response.text()
  const lines = body.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) {
    throw new LichessExportError("Lichess returned no games.", 422, "no_usable_games")
  }

  const games = []
  for (const line of lines) {
    try {
      const game = JSON.parse(line)
      if (!game || typeof game !== "object" || Array.isArray(game)) {
        throw new Error("not an object")
      }
      games.push(game)
    } catch {
      throw new LichessExportError(
        "Lichess returned a malformed NDJSON response.",
        502,
        "malformed_response",
      )
    }
  }

  return { username: safeUsername, contentType, games }
}
