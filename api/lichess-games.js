import { fetchLichessExport, LichessExportError } from "../server/lichess-export-core.mjs"

let requestInProgress = false

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0")

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  if (requestInProgress) {
    res.status(409).json({ error: "Lichess request already in progress" })
    return
  }

  const rawUsername = Array.isArray(req.query?.username)
    ? req.query.username[0]
    : req.query?.username

  requestInProgress = true
  try {
    const result = await fetchLichessExport(rawUsername)
    res.status(200).json({ username: result.username, games: result.games })
  } catch (error) {
    if (error instanceof LichessExportError) {
      res.status(error.status).json({ error: error.message, code: error.code })
      return
    }
    res.status(502).json({ error: "Lichess export request could not be completed", code: "upstream_error" })
  } finally {
    requestInProgress = false
  }
}
