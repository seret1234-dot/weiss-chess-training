import { supabase } from "../lib/supabase"
import { extractOpeningKeyFromPgn, fetchChessComGames, normalizeChessComGames } from "./chesscomImport"
import { fetchLichessGames, normalizeLichessGames, pgnFingerprint, type ConnectedImportGame } from "./lichessImport"

type Source = "chess.com" | "lichess"

export function requestedConnectedSources(chesscomUsername?: string | null, lichessUsername?: string | null) {
 const sources: Source[] = []
 if (clean(chesscomUsername)) sources.push("chess.com")
 if (clean(lichessUsername)) sources.push("lichess")
 return sources
}

export type ConnectedImportProgress = {
 message: string
 source?: Source
 warning?: string
 sourceCounts?: Record<Source, number>
 alreadyPresent?: number
 crossSourceDuplicatesRemoved?: number
 capExcluded?: number
 keptGamesCount?: number
}

export type ConnectedImportResult = {
 importedGamesCount: number
 retainedGamesCount: number
 sourcesImported: Source[]
 sourceCounts: Record<Source, number>
 retainedSourceCounts: Record<Source, number>
 warnings: string[]
 failedSources: Source[]
 alreadyPresent: number
 crossSourceDuplicatesRemoved: number
 capExcluded: number
 openingProfile: { white: OpeningRow[]; black: OpeningRow[] }
}

export class ConnectedImportFailure extends Error {
 retainedGamesCount: number
 retainedSourceCounts: Record<Source, number>

 constructor(message: string, retained: { total: number; sourceCounts: Record<Source, number> }) {
  super(message)
  this.name = "ConnectedImportFailure"
  this.retainedGamesCount = retained.total
  this.retainedSourceCounts = retained.sourceCounts
 }
}

type OpeningRow = { key: string; count: number; score: number; avgScore: number }
type ExistingConnectedGame = Pick<ConnectedImportGame, "source" | "sourceGameId" | "pgn" | "userColor" | "userResult" | "endTime" | "timeClass" | "timeControl" | "userRating" | "opponentUsername" | "opponentRating" | "url"> & { fingerprint: string | null }
type Fetchers = {
 fetchChessCom?: typeof fetchChessComGames
 fetchLichess?: typeof fetchLichessGames
}

function clean(value: string | null | undefined) {
 return String(value || "").trim()
}

export function resolveSavedConnectedAccounts(
 autoProfile: Record<string, unknown> | null | undefined,
 metadata: Record<string, unknown> | null | undefined,
) {
 const hasProfileField = (field: string) => Boolean(autoProfile && Object.prototype.hasOwnProperty.call(autoProfile, field))
 return {
  chesscom: hasProfileField("chesscom_username")
   ? clean(autoProfile?.chesscom_username)
   : clean(metadata?.chess_com_username || metadata?.chessComUsername),
  lichess: hasProfileField("lichess_username")
   ? clean(autoProfile?.lichess_username)
   : clean(metadata?.lichess_username || metadata?.lichessUsername),
 }
}

export function hasUnsavedConnectedAccountChanges(
 chesscom: string,
 lichess: string,
 savedChesscom: string,
 savedLichess: string,
) {
 return clean(chesscom) !== clean(savedChesscom) || clean(lichess) !== clean(savedLichess)
}

export function requiresVisibleImportFailure(failedSources: Source[], newlyAddedCount: number) {
 return failedSources.length > 0 && newlyAddedCount === 0
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
 existing: ExistingConnectedGame[] = [],
 maxGames = 150,
) {
 const sourceForId = new Map<string, Source>()
 const sourcesForFingerprint = new Map<string, Set<Source>>()
 const register = (game: Pick<ConnectedImportGame, "source" | "sourceGameId" | "fingerprint">) => {
  sourceForId.set(`${game.source}:${game.sourceGameId}`, game.source)
  if (!game.fingerprint) return
  const sources = sourcesForFingerprint.get(game.fingerprint) || new Set<Source>()
  sources.add(game.source)
  sourcesForFingerprint.set(game.fingerprint, sources)
 }
 for (const game of existing) register(game)
 const sorted = candidates.slice().sort((a, b) => (b.endTime || 0) - (a.endTime || 0) || a.source.localeCompare(b.source))
 const games: ConnectedImportGame[] = []
 let alreadyPresent = 0
 let crossSourceDuplicatesRemoved = 0
 let capExcluded = 0

 for (const game of sorted) {
  const sourceId = `${game.source}:${game.sourceGameId}`
  const sameSourceId = sourceForId.has(sourceId)
  const fingerprintSources = game.fingerprint ? sourcesForFingerprint.get(game.fingerprint) : undefined
  if (sameSourceId || fingerprintSources?.has(game.source)) {
   alreadyPresent += 1
   continue
  }
  if (fingerprintSources?.size) {
   crossSourceDuplicatesRemoved += 1
   continue
  }
  register(game)
  if (games.length < maxGames) games.push(game)
  else capExcluded += 1
 }

 const sourceCounts: Record<Source, number> = { "chess.com": 0, lichess: 0 }
 for (const game of games) sourceCounts[game.source] += 1
 return { games, alreadyPresent, crossSourceDuplicatesRemoved, capExcluded, sourceCounts }
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
  .select("source,source_game_id,url,time_class,time_control,end_time,user_color,user_result,user_rating,opponent_username,opponent_rating,pgn")
  .eq("user_id", userId)
 if (error) throw new Error(`Could not check previously imported games: ${error.message}`)
 return (data || []).flatMap((row: any): ExistingConnectedGame[] => {
  if (!row?.pgn || (row.user_color !== "white" && row.user_color !== "black")) return []
  if (row.source !== "chess.com" && row.source !== "lichess") return []
  const userResult = row.user_result === "win" || row.user_result === "draw" || row.user_result === "loss" ? row.user_result : null
  const endTime = Number.isFinite(Number(row.end_time)) ? Number(row.end_time) : null
  return [{
   source: row.source,
   sourceGameId: String(row.source_game_id || ""),
   url: row.url || null,
   timeClass: row.time_class || null,
   timeControl: row.time_control || null,
   pgn: String(row.pgn),
   userColor: row.user_color,
   userResult,
   endTime,
   userRating: Number.isFinite(Number(row.user_rating)) ? Number(row.user_rating) : null,
   opponentUsername: row.opponent_username || null,
   opponentRating: Number.isFinite(Number(row.opponent_rating)) ? Number(row.opponent_rating) : null,
   fingerprint: pgnFingerprint(String(row.pgn), row.user_color, userResult, endTime),
  }]
 })
}

export async function getRetainedConnectedGameTotals(userId: string) {
 const { data, error } = await supabase
  .from("user_imported_games")
  .select("source")
  .eq("user_id", userId)
 if (error) throw new Error(`Could not reload retained imported games: ${error.message}`)
 const sourceCounts: Record<Source, number> = { "chess.com": 0, lichess: 0 }
 for (const row of data || []) {
  if (row.source === "chess.com" || row.source === "lichess") sourceCounts[row.source] += 1
 }
 return { sourceCounts, total: sourceCounts["chess.com"] + sourceCounts.lichess }
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
  engine_analyzed: false,
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
 const requestedSources = requestedConnectedSources(chesscom, lichess)
 if (!requestedSources.length) throw new Error("Enter a Chess.com or Lichess username to import your games.")

 const fetchChess = fetchers.fetchChessCom || fetchChessComGames
 const fetchLichess = fetchers.fetchLichess || fetchLichessGames
 const candidates: ConnectedImportGame[] = []
 const warnings: string[] = []
 const sourcesImported: Source[] = []
 const failedSources: Source[] = []

 if (requestedSources.includes("chess.com")) {
  onProgress?.({ source: "chess.com", message: "Importing Chess.com games…" })
  try {
   const raw = await fetchChess(chesscom)
   const games = normalizeChessComGames(raw, chesscom)
   if (!games.length) throw new Error("No usable Chess.com games were found.")
   candidates.push(...games)
  sourcesImported.push("chess.com")
  onProgress?.({ source: "chess.com", message: `Imported ${games.length} games from Chess.com.` })
  } catch (error) {
   failedSources.push("chess.com")
   warnings.push(`Chess.com: ${error instanceof Error ? error.message : "Import failed."}`)
  }
 }

 if (requestedSources.includes("lichess")) {
  onProgress?.({ source: "lichess", message: "Importing Lichess games…" })
  try {
   const raw = await fetchLichess(lichess)
   const normalized = normalizeLichessGames(raw, lichess)
   if (!normalized.games.length) throw new Error("No usable standard Lichess games were found.")
   candidates.push(...normalized.games)
  sourcesImported.push("lichess")
  onProgress?.({ source: "lichess", message: `Imported ${normalized.games.length} games from Lichess.` })
   const excluded = Object.values(normalized.rejected).reduce((sum, value) => sum + value, 0)
   if (excluded) warnings.push(`Lichess: ${excluded} unsupported or malformed games were skipped.`)
  } catch (error) {
   failedSources.push("lichess")
   warnings.push(`Lichess: ${error instanceof Error ? error.message : "Import failed."}`)
  }
 }

 if (!sourcesImported.length) {
  const retained = await getRetainedConnectedGameTotals(userId)
  throw new ConnectedImportFailure(
   warnings.join(" ") || "No connected account could be imported.",
   retained,
  )
 }
 sourceImportOutcome(sourcesImported, warnings)

 onProgress?.({ message: "Combining recent games…" })
 const existing = await existingGamesForUser(userId)
 const merged = mergeConnectedGames(candidates, existing, 150)
 await persistConnectedGames(userId, merged.games)
 const retained = await getRetainedConnectedGameTotals(userId)

 const retainedGames = [...existing, ...merged.games]
 const openingProfile = {
  white: summarizeOpenings(retainedGames, "white"),
  black: summarizeOpenings(retainedGames, "black"),
 }
 const now = new Date().toISOString()
 const profileUpdate: Record<string, unknown> = {
  user_id: userId,
  opening_profile: openingProfile,
  detected_ratings: detectedRatings(retainedGames),
  detected_time_controls: detectedTimeControls(retainedGames),
  imported_games_count: retained.total,
 }
 if (chesscom) profileUpdate.chesscom_username = chesscom
 if (lichess) profileUpdate.lichess_username = lichess
 if (sourcesImported.includes("chess.com")) profileUpdate.chesscom_last_import_at = now

 const { error: profileError } = await supabase.from("user_auto_profile").upsert(profileUpdate)
 if (profileError) throw new Error(`Could not save your connected-account profile: ${profileError.message}`)

 const combinedMessage = sourcesImported.length === 1
  ? `Imported ${merged.sourceCounts[sourcesImported[0]]} games from ${sourcesImported[0] === "lichess" ? "Lichess" : "Chess.com"}.`
  : `Imported ${merged.games.length} games total: ${merged.sourceCounts["chess.com"]} from Chess.com and ${merged.sourceCounts.lichess} from Lichess.`

 onProgress?.({
  message: combinedMessage,
  warning: warnings.length ? warnings.join(" ") : undefined,
  sourceCounts: merged.sourceCounts,
  alreadyPresent: merged.alreadyPresent,
  crossSourceDuplicatesRemoved: merged.crossSourceDuplicatesRemoved,
  capExcluded: merged.capExcluded,
  keptGamesCount: retained.total,
 })
 return {
  ...merged,
  sourcesImported,
  sourceCounts: merged.sourceCounts,
  retainedSourceCounts: retained.sourceCounts,
  retainedGamesCount: retained.total,
  warnings,
  failedSources,
  openingProfile,
  importedGamesCount: merged.games.length,
 }
}
