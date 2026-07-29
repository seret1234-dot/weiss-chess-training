import { Chess } from "chess.js"

export type ConnectedImportGame = {
 source: "chess.com" | "lichess"
 sourceGameId: string
 url: string | null
 timeClass: string | null
 timeControl: string | null
 endTime: number | null
 userColor: "white" | "black"
 userResult: "win" | "draw" | "loss" | null
 userRating: number | null
 opponentUsername: string | null
 opponentRating: number | null
 pgn: string
 fingerprint: string | null
}

type LichessPlayer = {
 user?: { id?: string; name?: string }
 rating?: number
}

type LichessGame = {
 id?: string
 moves?: string
 variant?: string | { key?: string }
 status?: string
 winner?: "white" | "black"
 speed?: string
 perf?: string
 rated?: boolean
 clock?: { initial?: number; increment?: number }
 createdAt?: number
 lastMoveAt?: number
 players?: { white?: LichessPlayer; black?: LichessPlayer }
}

function normalizeUsername(value: unknown) {
 return String(value || "").trim().toLowerCase()
}

function variantKey(value: LichessGame["variant"]) {
 return typeof value === "string" ? value.toLowerCase() : String(value?.key || "").toLowerCase()
}

function playerName(player?: LichessPlayer) {
 return String(player?.user?.name || player?.user?.id || "").trim()
}

function playerRating(player?: LichessPlayer) {
 const rating = Number(player?.rating)
 return Number.isFinite(rating) ? rating : null
}

function resultForUser(game: LichessGame, color: "white" | "black") {
 if (game.winner === color) return "win" as const
 if (game.winner === "white" || game.winner === "black") return "loss" as const
 if (String(game.status || "").toLowerCase() === "aborted") return null
 return "draw" as const
}

function resultToken(result: ConnectedImportGame["userResult"], color: "white" | "black") {
 if (result === "draw") return "1/2-1/2"
 if (result === "win") return color === "white" ? "1-0" : "0-1"
 if (result === "loss") return color === "white" ? "0-1" : "1-0"
 return "*"
}

function timeControl(game: LichessGame) {
 const initial = Number(game.clock?.initial)
 const increment = Number(game.clock?.increment)
 if (Number.isFinite(initial) && Number.isFinite(increment)) {
  return `${initial}+${increment}`
 }
 return String(game.perf || game.speed || "") || null
}

export function pgnFingerprint(
 pgn: string,
 userColor: ConnectedImportGame["userColor"],
 userResult: ConnectedImportGame["userResult"],
 endTime: number | null,
) {
 try {
  const chess = new Chess()
  chess.loadPgn(pgn)
  const mainline = chess.history().join(" ")
  if (!mainline) return null
  const timeBucket = endTime === null ? "unknown" : String(Math.floor(endTime / 300))
  return `${mainline}|${userColor}|${userResult || "unknown"}|${timeBucket}`
 } catch {
  return null
 }
}

export function reconstructLichessPgn(
 moves: string,
 metadata: Pick<ConnectedImportGame, "userColor" | "userResult" | "endTime"> & { rated?: boolean; timeControl?: string | null },
 players: { white: string; black: string },
) {
 const tokens = String(moves || "").trim().split(/\s+/).filter(Boolean)
 if (!tokens.length) throw new Error("Lichess game has no moves.")

  const chess = new Chess()
  for (const token of tokens) {
   const match = token.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i)
   try {
    const move = match
     ? chess.move({ from: match[1].toLowerCase(), to: match[2].toLowerCase(), promotion: match[3]?.toLowerCase() })
     : chess.move(token)
    if (!move) throw new Error("Lichess game contains an illegal move sequence.")
   } catch {
    throw new Error("Lichess game contains an illegal move sequence.")
   }
 }

 chess.header(
  "Event", "Lichess imported game",
  "White", players.white || "White",
  "Black", players.black || "Black",
  "Result", resultToken(metadata.userResult, metadata.userColor),
  "Variant", "Standard",
  "Rated", metadata.rated ? "true" : "false",
  "TimeControl", metadata.timeControl || "-",
  "Date", metadata.endTime ? new Date(metadata.endTime * 1000).toISOString().slice(0, 10).replaceAll("-", ".") : "????.??.??",
 )
 return chess.pgn()
}

export function normalizeLichessGames(games: unknown[], username: string) {
 const requestedUsername = normalizeUsername(username)
 const normalized: ConnectedImportGame[] = []
 const rejected = { variant: 0, aborted: 0, malformed: 0, empty: 0, illegal: 0, unrelated: 0 }

 for (const raw of games) {
  const game = raw as LichessGame
  if (!game || typeof game !== "object" || variantKey(game.variant) !== "standard") {
   rejected.variant += 1
   continue
  }
  if (String(game.status || "").toLowerCase() === "aborted") {
   rejected.aborted += 1
   continue
  }
  if (!String(game.id || "").trim() || !String(game.moves || "").trim()) {
   rejected.empty += 1
   continue
  }

  const white = game.players?.white
  const black = game.players?.black
  const whiteName = playerName(white)
  const blackName = playerName(black)
  const color = normalizeUsername(whiteName) === requestedUsername
   ? "white"
   : normalizeUsername(blackName) === requestedUsername
    ? "black"
    : null
  if (!color) {
   rejected.unrelated += 1
   continue
  }

  const endTimeCandidate = Number(game.lastMoveAt ?? game.createdAt)
  const endTime = Number.isFinite(endTimeCandidate) ? Math.floor(endTimeCandidate / 1000) : null
  const userResult = resultForUser(game, color)
  if (!userResult) {
   rejected.malformed += 1
   continue
  }

  const base: Omit<ConnectedImportGame, "pgn" | "fingerprint"> = {
   source: "lichess",
   sourceGameId: String(game.id).trim(),
   url: `https://lichess.org/${String(game.id).trim()}`,
   timeClass: String(game.speed || game.perf || "").trim().toLowerCase() || null,
   timeControl: timeControl(game),
   endTime,
   userColor: color,
   userResult,
   userRating: playerRating(color === "white" ? white : black),
   opponentUsername: color === "white" ? blackName || null : whiteName || null,
   opponentRating: playerRating(color === "white" ? black : white),
  }

  try {
   const pgn = reconstructLichessPgn(
    String(game.moves),
    { ...base, rated: game.rated === true },
    { white: whiteName, black: blackName },
   )
   normalized.push({ ...base, pgn, fingerprint: pgnFingerprint(pgn, color, userResult, endTime) })
  } catch (error) {
   if (error instanceof Error && error.message.includes("illegal")) rejected.illegal += 1
   else rejected.malformed += 1
  }
 }

 return { games: normalized, rejected }
}

export async function fetchLichessGames(username: string) {
 const response = await fetch(`/api/lichess-games?username=${encodeURIComponent(username.trim())}`)
 const body = await response.json().catch(() => null)
 if (!response.ok) throw new Error(body?.error || "Lichess games could not be loaded.")
 if (!Array.isArray(body?.games)) throw new Error("Lichess returned a malformed game list.")
 return body.games as unknown[]
}
