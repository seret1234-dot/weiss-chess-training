import { supabase } from "../lib/supabase"
import { pgnFingerprint, type ConnectedImportGame } from "./lichessImport"

type OpeningRow = {
 key: string
 count: number
 score: number
 avgScore: number
}

type OpeningProfile = {
 white: OpeningRow[]
 black: OpeningRow[]
}

type ImportSummary = {
 openingProfile: OpeningProfile
 detectedRatings: Record<string, number | null>
 detectedTimeControls: Record<string, number>
 importedGamesCount: number
}

export type ChessComImportResult = ImportSummary & {
 importedGamesSaved: true
 profileSaved: true
}

const MAX_PER_CLASS = 50

function cleanUsername(username: string) {
 return username.trim().toLowerCase()
}

function gameTimeClass(game: any): "blitz" | "rapid" | "long" | null {
 const tc = String(game?.time_class || "").toLowerCase()

 if (tc === "blitz") return "blitz"
 if (tc === "rapid") return "rapid"
 if (tc === "daily" || tc === "standard" || tc === "classical") return "long"

 return null
}

function userSide(game: any, username: string): "white" | "black" | null {
 const user = cleanUsername(username)
 const white = String(game?.white?.username || "").toLowerCase()
 const black = String(game?.black?.username || "").toLowerCase()

 if (white === user) return "white"
 if (black === user) return "black"

 return null
}

function userRating(game: any, username: string): number | null {
 const side = userSide(game, username)
 if (!side) return null

 const rating = Number(game?.[side]?.rating)
 return Number.isFinite(rating) ? rating : null
}

function userScore(game: any, username: string): number {
 const side = userSide(game, username)
 if (!side) return 0

 const result = String(game?.[side]?.result || "").toLowerCase()

 if (result === "win") return 1

 const drawResults = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
 ])

 if (drawResults.has(result)) return 0.5

 return 0
}

export async function fetchChessComGames(username: string) {
 const clean = cleanUsername(username)
 if (!clean) throw new Error("Enter a Chess.com username to import your games.")

 try {
  console.log("Fetching Chess.com archives for:", clean)

  const archivesRes = await fetch(
   `https://api.chess.com/pub/player/${clean}/games/archives`,
  )

  if (archivesRes.status === 404) {
   throw new Error(`Chess.com username \"${clean}\" was not found.`)
  }

  if (!archivesRes.ok) {
   throw new Error(`Chess.com could not load this account (HTTP ${archivesRes.status}).`)
  }

  const archivesData = await archivesRes.json()
  const archives: string[] = archivesData.archives || []

  if (!archives.length) return []

  const counts = {
   blitz: 0,
   rapid: 0,
   long: 0,
  }

  const selected: any[] = []

  for (const url of archives.slice().reverse()) {
   if (
    counts.blitz >= MAX_PER_CLASS &&
    counts.rapid >= MAX_PER_CLASS &&
    counts.long >= MAX_PER_CLASS
   ) {
    break
   }

   try {
    const res = await fetch(url)
    if (!res.ok) {
     console.error("Archive fetch failed:", url, res.status)
     continue
    }

    const data = await res.json()
    const games = Array.isArray(data.games) ? data.games.slice() : []

    games.sort((a: any, b: any) => Number(b.end_time || 0) - Number(a.end_time || 0))

    for (const game of games) {
     const klass = gameTimeClass(game)
     if (!klass) continue
     if (!userSide(game, clean)) continue
     if (counts[klass] >= MAX_PER_CLASS) continue

     selected.push(game)
     counts[klass] += 1
    }
   } catch (e) {
    console.error("Archive fetch error:", e)
   }
  }

  console.log("CHESS.COM IMPORT COUNTS:", counts)
  console.log("CHESS.COM IMPORT TOTAL:", selected.length)

  return selected
 } catch (error) {
  if (error instanceof Error) throw error
  throw new Error("Chess.com could not be reached. Please try again.")
 }
}

function stripPgnHeaders(pgn: string) {
 return pgn
  .split("\n")
  .filter((line) => !line.trim().startsWith("["))
  .join(" ")
}

export function extractOpeningKeyFromPgn(pgn: string): string {
 if (!pgn) return ""

 const body = stripPgnHeaders(pgn)
  .replace(/\{[^}]*\}/g, " ")
  .replace(/\([^)]*\)/g, " ")
  .replace(/\$\d+/g, " ")
  .replace(/\s+/g, " ")
  .trim()

 const tokens = body.split(" ")
 const moves: string[] = []

 for (const token of tokens) {
  const t = token.trim()

  if (!t) continue
  if (/^\d+\.+$/.test(t)) continue
  if (/^\d+\.\.\.$/.test(t)) continue
  if (t === "1-0" || t === "0-1" || t === "1/2-1/2" || t === "*") break

  const cleaned = t.replace(/^\d+\.+/, "").trim()
  if (!cleaned) continue
  if (cleaned === "1-0" || cleaned === "0-1" || cleaned === "1/2-1/2" || cleaned === "*") break

  moves.push(cleaned)

  if (moves.length >= 6) break
 }

 return moves.join(" ")
}

function detectTopOpenings(games: any[], username: string): OpeningRow[] {
 const map = new Map<string, { count: number; score: number }>()

 for (const game of games) {
  if (!game?.pgn) continue

  const key = extractOpeningKeyFromPgn(game.pgn)
  if (!key) continue

  const prev = map.get(key) || { count: 0, score: 0 }
  prev.count += 1
  prev.score += userScore(game, username)
  map.set(key, prev)
 }

 return [...map.entries()]
  .map(([key, value]) => ({
   key,
   count: value.count,
   score: value.score,
   avgScore: value.count ? value.score / value.count : 0,
  }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 8)
}

export function splitOpeningsBySide(games: any[], username: string): OpeningProfile {
 const whiteGames: any[] = []
 const blackGames: any[] = []

 for (const game of games) {
  const side = userSide(game, username)

  if (side === "white") whiteGames.push(game)
  if (side === "black") blackGames.push(game)
 }

 return {
  white: detectTopOpenings(whiteGames, username),
  black: detectTopOpenings(blackGames, username),
 }
}

function detectRatings(games: any[], username: string): Record<string, number | null> {
 const latest: Record<string, { time: number; rating: number } | null> = {
  blitz: null,
  rapid: null,
  long: null,
 }

 for (const game of games) {
  const klass = gameTimeClass(game)
  if (!klass) continue

  const rating = userRating(game, username)
  if (rating === null) continue

  const time = Number(game.end_time || 0)
  const old = latest[klass]

  if (!old || time > old.time) {
   latest[klass] = { time, rating }
  }
 }

 return {
  blitz: latest.blitz?.rating ?? null,
  rapid: latest.rapid?.rating ?? null,
  long: latest.long?.rating ?? null,
 }
}

function detectTimeControls(games: any[]): Record<string, number> {
 const counts = {
  blitz: 0,
  rapid: 0,
  long: 0,
 }

 for (const game of games) {
  const klass = gameTimeClass(game)
  if (klass) counts[klass] += 1
 }

 return counts
}



function userResult(game: any, username: string): string | null {
 const side = userSide(game, username)
 if (side === "white") return game?.white?.result ?? null
 if (side === "black") return game?.black?.result ?? null
 return null
}
function sourceGameId(game: any): string {
 const uuid = String(game?.uuid || "").trim()
 if (uuid) return uuid

 const url = String(game?.url || "").trim()
 if (url) {
  const parts = url.split("/").filter(Boolean)
  const last = parts[parts.length - 1]
  if (last) return last
 }

 return String(game?.end_time || Date.now())
}

function opponentUsername(game: any, username: string): string | null {
 const side = userSide(game, username)
 if (side === "white") return game?.black?.username ?? null
 if (side === "black") return game?.white?.username ?? null
 return null
}

function opponentRating(game: any, username: string): number | null {
 const side = userSide(game, username)
 const rating = side === "white" ? game?.black?.rating : side === "black" ? game?.white?.rating : null
 return typeof rating === "number" ? rating : null
}

export function normalizeChessComGames(games: any[], username: string): ConnectedImportGame[] {
 const clean = cleanUsername(username)
 return games.flatMap((game) => {
  if (!game?.pgn) return []
  const userColor = userSide(game, clean)
  const timeClass = gameTimeClass(game)
  if (!userColor || !timeClass) return []

  const result = String(userResult(game, clean) || "").toLowerCase()
  const userResultValue = result === "win"
   ? "win"
   : new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]).has(result)
    ? "draw"
    : "loss"
  const endTimeValue = Number(game?.end_time)
  const endTime = Number.isFinite(endTimeValue) ? endTimeValue : null
  const pgn = String(game.pgn)
  return [{
   source: "chess.com",
   sourceGameId: sourceGameId(game),
   url: game?.url ?? null,
   timeClass,
   timeControl: game?.time_control ?? null,
   endTime,
   userColor,
   userResult: userResultValue,
   userRating: userRating(game, clean),
   opponentUsername: opponentUsername(game, clean),
   opponentRating: opponentRating(game, clean),
   pgn,
   fingerprint: pgnFingerprint(pgn, userColor, userResultValue, endTime),
  }]
 })
}

async function saveImportedGames(userId: string, username: string, games: any[]) {
 const rows = games
  .filter((game) => game?.pgn)
  .map((game) => ({
   user_id: userId,
   source: "chess.com",
   source_game_id: sourceGameId(game),
   url: game?.url ?? null,
   time_class: gameTimeClass(game),
   time_control: game?.time_control ?? null,
   end_time: game?.end_time ?? null,
   user_color: userSide(game, username),
   user_result: userResult(game, username),
   user_rating: userRating(game, username),
   opponent_username: opponentUsername(game, username),
   opponent_rating: opponentRating(game, username),
   pgn: game.pgn,
  }))

 if (!rows.length) {
  throw new Error("Chess.com returned no usable games to import.")
 }

 const { error } = await supabase
  .from("user_imported_games")
  .upsert(rows, { onConflict: "user_id,source,source_game_id" })

 if (error) {
  throw new Error(`Could not save imported Chess.com games: ${error.message}`)
 }

 console.log("IMPORTED GAMES SAVED:", rows.length)
}

export async function saveChessComImport(
 userId: string,
 username: string,
 summary: ImportSummary,
) {
 const { data, error } = await supabase
  .from("user_auto_profile")
  .upsert({
   user_id: userId,
   chesscom_username: username,
   opening_profile: summary.openingProfile,
   detected_ratings: summary.detectedRatings,
   detected_time_controls: summary.detectedTimeControls,
   imported_games_count: summary.importedGamesCount,
   chesscom_last_import_at: new Date().toISOString(),
  })
  .select()

 if (error) {
  throw new Error(`Could not save your Chess.com profile: ${error.message}`)
 }

 console.log("CHESS.COM IMPORT SAVE RESULT:", data)

 if (!data?.length) {
  throw new Error("Could not confirm your Chess.com profile was saved.")
 }
}

export async function runChessComImport(
 username: string,
 userId: string,
): Promise<ChessComImportResult> {
 const clean = cleanUsername(username)

 console.log("RUN CHESS.COM IMPORT:", { username: clean, userId })

 const games = await fetchChessComGames(clean)

 if (!games.length) {
  throw new Error(
   "No usable Chess.com games were found. Check the username or play a rapid, blitz, or daily game first.",
  )
 }

 const openingProfile = splitOpeningsBySide(games, clean)
 const detectedRatings = detectRatings(games, clean)
 const detectedTimeControls = detectTimeControls(games)

 const summary: ImportSummary = {
  openingProfile,
  detectedRatings,
  detectedTimeControls,
  importedGamesCount: games.length,
 }

 console.log("=== CHESS.COM IMPORT SUMMARY ===")
 console.log(summary)

 await saveImportedGames(userId, clean, games)
 await saveChessComImport(userId, clean, summary)

 return {
  ...summary,
  importedGamesSaved: true,
  profileSaved: true,
 }
}
