import { supabase } from "../lib/supabase"

type OpeningProfile = {
  white: [string, number][]
  black: [string, number][]
}

export async function fetchChessComGames(username: string) {
  const clean = username.trim().toLowerCase()
  if (!clean) return []

  try {
    console.log("Fetching Chess.com archives for:", clean)

    const archivesRes = await fetch(
      `https://api.chess.com/pub/player/${clean}/games/archives`
    )

    if (!archivesRes.ok) {
      console.error("Archives fetch failed:", archivesRes.status)
      return []
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
  } catch (e) {
    console.error("Chess.com fetch failed:", e)
    return []
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

export async function saveOpeningProfile(userId: string, profile: OpeningProfile) {
  const white = profile.white.slice(0, 2).map((o) => o[0])
  const black = profile.black.slice(0, 2).map((o) => o[0])
  const preferred = [...white, ...black]

  console.log("PREFERRED OPENINGS TO SAVE:", preferred)
  console.log("UPDATING USER:", userId)

  const { data, error } = await supabase
    .from("auto_profiles")
    .update({
      preferred_openings: preferred,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select()

  if (error) {
    console.error("Saving opening profile failed:", error)
    return false
  }

  console.log("SAVE RESULT:", data)

  if (!data || data.length === 0) {
    console.warn("No auto_profiles row updated. Check user_id/RLS.")
    return false
  }

  return true
}

export async function runChessComImport(username: string, userId: string) {
  console.log("RUN CHESS.COM IMPORT:", { username, userId })

  const games = await fetchChessComGames(username)

  if (!games.length) {
    console.warn("No games found")
    return null
  }

  const split = splitOpeningsBySide(games, username)

  console.log("=== OPENING PROFILE ===")
  console.log("WHITE:", split.white)
  console.log("BLACK:", split.black)

  const saved = await saveOpeningProfile(userId, split)

  console.log("IMPORT SAVED:", saved)

  return split
}