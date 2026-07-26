import { supabase } from "../lib/supabase"

type OpeningProfile = {
 white: [string, number][]
 black: [string, number][]
}

export type ChessComImportResult = {
 openingProfile: OpeningProfile
 importedGamesCount: number
 importedGamesSaved: true
 profileSaved: true
}

export async function fetchChessComGames(username: string) {
 const clean = username.trim().toLowerCase()
 if (!clean) throw new Error("Enter a Chess.com username to import your games.")

 try {
 console.log("Fetching Chess.com archives for:", clean)

 const archivesRes = await fetch(
 `https://api.chess.com/pub/player/${clean}/games/archives`
 )

 if (archivesRes.status === 404) {
 throw new Error(`Chess.com username \"${clean}\" was not found.`)
 }

 if (!archivesRes.ok) {
 throw new Error(`Chess.com could not load this account (HTTP ${archivesRes.status}).`)
 }

 const archivesData = await archivesRes.json()
 const archives: string[] = archivesData.archives || []

 console.log("ARCHIVES COUNT:", archives.length)

 if (!archives.length) return []

 const recent = archives.slice(-3)
 const games: any[] = []

 for (const url of recent) {
 try {
 const res = await fetch(url)
 if (!res.ok) {
 console.error("Archive fetch failed:", url, res.status)
 continue
 }

 const data = await res.json()
 if (Array.isArray(data.games)) {
 games.push(...data.games)
 }
 } catch (e) {
 console.error("Archive fetch error:", e)
 }
 }

 console.log("GAMES COUNT:", games.length)

 return games
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

export function detectTopOpenings(games: any[]) {
 const map = new Map<string, number>()

 for (const g of games) {
 if (!g?.pgn) continue

 const key = extractOpeningKeyFromPgn(g.pgn)
 if (!key) continue

 map.set(key, (map.get(key) || 0) + 1)
 }

 return [...map.entries()]
 .sort((a, b) => b[1] - a[1])
 .slice(0, 6)
}

export function splitOpeningsBySide(games: any[], username: string): OpeningProfile {
 const whiteGames: any[] = []
 const blackGames: any[] = []

 const user = username.trim().toLowerCase()

 for (const g of games) {
 const white = g.white?.username?.toLowerCase()
 const black = g.black?.username?.toLowerCase()

 if (white === user) whiteGames.push(g)
 else if (black === user) blackGames.push(g)
 }

 console.log("WHITE GAMES:", whiteGames.length)
 console.log("BLACK GAMES:", blackGames.length)

 return {
 white: detectTopOpenings(whiteGames),
 black: detectTopOpenings(blackGames),
 }
}

function sourceGameId(game: any) {
 const uuid = String(game?.uuid || "").trim()
 if (uuid) return uuid

 const url = String(game?.url || "").trim()
 if (url) return url.split("/").filter(Boolean).pop() || url

 return String(game?.end_time || "unknown-game")
}

function userColor(game: any, username: string): "white" | "black" | null {
 const clean = username.trim().toLowerCase()
 if (String(game?.white?.username || "").toLowerCase() === clean) return "white"
 if (String(game?.black?.username || "").toLowerCase() === clean) return "black"
 return null
}

async function saveImportedGames(userId: string, username: string, games: any[]) {
 const rows = games
 .filter((game) => game?.pgn && userColor(game, username))
 .map((game) => ({
 user_id: userId,
 source: "chess.com",
 source_game_id: sourceGameId(game),
 url: game?.url ?? null,
 time_class: game?.time_class ?? null,
 time_control: game?.time_control ?? null,
 end_time: game?.end_time ?? null,
 user_color: userColor(game, username),
 pgn: game.pgn,
 }))

 if (!rows.length) {
 throw new Error("Chess.com returned no usable games to import.")
 }

 const { error } = await supabase
 .from("user_imported_games")
 .upsert(rows, { onConflict: "user_id,source,source_game_id" })

 if (error) throw new Error(`Could not save imported Chess.com games: ${error.message}`)
}

export async function saveOpeningProfile(
 userId: string,
 username: string,
 profile: OpeningProfile,
 importedGamesCount: number,
) {
 const { data, error } = await supabase
 .from("user_auto_profile")
 .upsert({
 user_id: userId,
 chesscom_username: username,
 opening_profile: profile,
 imported_games_count: importedGamesCount,
 chesscom_last_import_at: new Date().toISOString(),
 })
 .select("user_id")

 if (error) throw new Error(`Could not save your Chess.com profile: ${error.message}`)
 if (!data?.length) throw new Error("Could not confirm your Chess.com profile was saved.")
}

export async function runChessComImport(username: string, userId: string): Promise<ChessComImportResult> {
 console.log("RUN CHESS.COM IMPORT:", { username, userId })

 const games = await fetchChessComGames(username)

 if (!games.length) {
 throw new Error(
 "No usable Chess.com games were found. Check the username or play a rapid, blitz, or daily game first.",
 )
 }

 const split = splitOpeningsBySide(games, username)

 console.log("=== OPENING PROFILE ===")
 console.log("WHITE:", split.white)
 console.log("BLACK:", split.black)

 await saveImportedGames(userId, username, games)
 await saveOpeningProfile(userId, username, split, games.length)

 return {
 openingProfile: split,
 importedGamesCount: games.length,
 importedGamesSaved: true,
 profileSaved: true,
 }
}
