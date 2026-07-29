import { supabase } from "../lib/supabase"
import { extractOpeningKeyFromPgn, fetchChessComGames, normalizeChessComGames } from "./chesscomImport"
import { fetchLichessGames, normalizeLichessGames, pgnFingerprint, type ConnectedImportGame } from "./lichessImport"

type Source = "chess.com" | "lichess"

export type ConnectedImportProgress = {
 message: string
 source?: Source
 warning?: string
}

export type ConnectedImportResult = {
 importedGamesCount: number
 sourcesImported: Source[]
 sourceCounts: Record<Source, number>
 warnings: string[]
 duplicatesSkipped: number
 openingProfile: { white: OpeningRow[]; black: OpeningRow[] }
}

type OpeningRow = { key: string; count: number; score: number; avgScore: number }
type Fetchers = {
 fetchChessCom?: typeof fetchChessComGames
 fetchLichess?: typeof fetchLichessGames
}

function clean(value: string | null | undefined) {
 return String(value || "").trim()
}

function summarizeOpenings(games: ConnectedImportGame[], color: "white" | "black") {
 const counts = new Map<string, { count: number; score: number }>()
 for (const game of games) {
  if (game.userColor !== color) continue
  const key = extractOpeningKeyFromPgn(game.pgn)
  if (!key) continue
  const current = counts.get(key) || { count: 0, score: 0 }
  current.count += 1
  current.score += game.userResult === "win" ? 1 : game.userResult === "draw" ? 0.5 : 0
  counts.set(key, current)
 }
 return [...counts.entries()]
  .map(([key, value]) => ({ key, count: value.count, score: value.score, avgScore: value.score / value.count }))
  .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  .slice(0, 8)
}

function detectedRatings(games: ConnectedImportGame[]) {
 const latest = new Map<string, ConnectedImportGame>()
 for (const game of games) {
  const key = game.timeClass || "unknown"
  if (game.userRating === null) continue
  const previous = latest.get(key)
  if (!previous || (game.endTime || 0) > (previous.endTime || 0)) latest.set(key, game)
 }
 return Object.fromEntries([...latest.entries()].map(([key, game]) => [key, game.userRating]))
}

function detectedTimeControls(games: ConnectedImportGame[]) {
 const counts: Record<string, number> = {}
 for (const game of games) {
  const key = game.timeClass || "unknown"
  counts[key] = (counts[key] || 0) + 1
 }
 return counts
}

export function mergeConnectedGames(
 candidates: ConnectedImportGame[],
 existing: Array<Pick<ConnectedImportGame, "pgn" | "userColor" | "userResult" | "endTime">> = [],
 maxGames = 150,
) {
 const existingFingerprints = new Set(
  existing.map((game) => pgnFingerprint(game.pgn, game.userColor, game.userResult, game.endTime)).filter(Boolean),
 )
 const seenSourceIds = new Set<string>()
 const seenFingerprints = new Set<string>(existingFingerprints)
 const sorted = candidates.slice().sort((a, b) => (b.endTime || 0) - (a.endTime || 0) || a.source.localeCompare(b.source))
 const games: ConnectedImportGame[] = []
 let duplicatesSkipped = 0

 for (const game of sorted) {
  const sourceId = `${game.source}:${game.sourceGameId}`
  if (seenSourceIds.has(sourceId) || (game.fingerprint && seenFingerprints.has(game.fingerprint))) {
   duplicatesSkipped += 1
   continue
  }
  seenSourceIds.add(sourceId)
  if (game.fingerprint) seenFingerprints.add(game.fingerprint)
  games.push(game)
  if (games.length >= maxGames) break
 }

 return { games, duplicatesSkipped }
}

export function sourceImportOutcome(sourcesImported: Source[], warnings: string[]) {
 if (!sourcesImported.length) {
  throw new Error(warnings.join(" ") || "No connected account could be imported.")
 }
 return { partial: warnings.length > 0, warnings }
}

async function existingGamesForUser(userId: string) {
 const { data, error } = await supabase
  .from("user_imported_games")
  .select("pgn,user_color,user_result,end_time")
  .eq("user_id", userId)
 if (error) throw new Error(`Could not check previously imported games: ${error.message}`)
 return (data || []).flatMap((row: any) => {
  if (!row?.pgn || (row.user_color !== "white" && row.user_color !== "black")) return []
  return [{
   pgn: String(row.pgn),
   userColor: row.user_color,
   userResult: row.user_result === "win" || row.user_result === "draw" || row.user_result === "loss" ? row.user_result : null,
   endTime: Number.isFinite(Number(row.end_time)) ? Number(row.end_time) : null,
  }]
 })
}

async function persistConnectedGames(userId: string, games: ConnectedImportGame[]) {
 if (!games.length) return
 const rows = games.map((game) => ({
  user_id: userId,
  source: game.source,
  source_game_id: game.sourceGameId,
  url: game.url,
  time_class: game.timeClass,
  time_control: game.timeControl,
  end_time: game.endTime,
  user_color: game.userColor,
  user_result: game.userResult,
  user_rating: game.userRating,
  opponent_username: game.opponentUsername,
  opponent_rating: game.opponentRating,
  pgn: game.pgn,
 }))
 const { error } = await supabase
  .from("user_imported_games")
  .upsert(rows, { onConflict: "user_id,source,source_game_id" })
 if (error) throw new Error(`Could not save imported games: ${error.message}`)
}

export async function importConnectedAccounts({
 userId,
 chesscomUsername,
 lichessUsername,
 onProgress,
 fetchers = {},
}: {
 userId: string
 chesscomUsername?: string | null
 lichessUsername?: string | null
 onProgress?: (progress: ConnectedImportProgress) => void
 fetchers?: Fetchers
}): Promise<ConnectedImportResult> {
 const chesscom = clean(chesscomUsername)
 const lichess = clean(lichessUsername)
 if (!chesscom && !lichess) throw new Error("Enter a Chess.com or Lichess username to import your games.")

 const fetchChess = fetchers.fetchChessCom || fetchChessComGames
 const fetchLichess = fetchers.fetchLichess || fetchLichessGames
 const candidates: ConnectedImportGame[] = []
 const warnings: string[] = []
 const sourceCounts: Record<Source, number> = { "chess.com": 0, lichess: 0 }
 const sourcesImported: Source[] = []

 if (chesscom) {
  onProgress?.({ source: "chess.com", message: "Importing Chess.com games…" })
  try {
   const raw = await fetchChess(chesscom)
   const games = normalizeChessComGames(raw, chesscom)
   if (!games.length) throw new Error("No usable Chess.com games were found.")
   candidates.push(...games)
   sourceCounts["chess.com"] = games.length
   sourcesImported.push("chess.com")
  } catch (error) {
   warnings.push(`Chess.com: ${error instanceof Error ? error.message : "Import failed."}`)
  }
 }

 if (lichess) {
  onProgress?.({ source: "lichess", message: "Importing Lichess games…" })
  try {
   const raw = await fetchLichess(lichess)
   const normalized = normalizeLichessGames(raw, lichess)
   if (!normalized.games.length) throw new Error("No usable standard Lichess games were found.")
   candidates.push(...normalized.games)
   sourceCounts.lichess = normalized.games.length
   sourcesImported.push("lichess")
   const excluded = Object.values(normalized.rejected).reduce((sum, value) => sum + value, 0)
   if (excluded) warnings.push(`Lichess: ${excluded} unsupported or malformed games were skipped.`)
  } catch (error) {
   warnings.push(`Lichess: ${error instanceof Error ? error.message : "Import failed."}`)
  }
 }

 sourceImportOutcome(sourcesImported, warnings)

 onProgress?.({ message: "Combining recent games…" })
 const existing = await existingGamesForUser(userId)
 const merged = mergeConnectedGames(candidates, existing, 150)
 await persistConnectedGames(userId, merged.games)

 const openingProfile = {
  white: summarizeOpenings(merged.games, "white"),
  black: summarizeOpenings(merged.games, "black"),
 }
 const now = new Date().toISOString()
 const profileUpdate: Record<string, unknown> = {
  user_id: userId,
  chesscom_username: chesscom || null,
  lichess_username: lichess || null,
  opening_profile: openingProfile,
  detected_ratings: detectedRatings(merged.games),
  detected_time_controls: detectedTimeControls(merged.games),
  imported_games_count: existing.length + merged.games.length,
 }
 if (sourcesImported.includes("chess.com")) profileUpdate.chesscom_last_import_at = now

 const { error: profileError } = await supabase.from("user_auto_profile").upsert(profileUpdate)
 if (profileError) throw new Error(`Could not save your connected-account profile: ${profileError.message}`)

 onProgress?.({
  message: `Imported ${merged.games.length} recent games from ${sourcesImported.length} account${sourcesImported.length === 1 ? "" : "s"}.`,
  warning: warnings.length ? warnings.join(" ") : undefined,
 })
 return { ...merged, sourcesImported, sourceCounts, warnings, openingProfile, importedGamesCount: merged.games.length }
}
