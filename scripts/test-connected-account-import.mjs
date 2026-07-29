import assert from "node:assert/strict"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
 const { normalizeChessComGames } = await vite.ssrLoadModule("/src/training/chesscomImport.ts")
 const { normalizeLichessGames, reconstructLichessPgn } = await vite.ssrLoadModule("/src/training/lichessImport.ts")
 const { mergeConnectedGames, sourceImportOutcome } = await vite.ssrLoadModule("/src/training/importConnectedAccounts.ts")
 const { sourceForImportedGame, buildSummary } = await vite.ssrLoadModule("/src/training/engineAnalyzeImportedGames.ts")
 const { buildPersonalTrainingPlan, getRecommendedSection } = await vite.ssrLoadModule("/src/training/buildPersonalTrainingPlan.ts")
 const { fetchLichessExport, LichessExportError } = await import("../server/lichess-export-core.mjs")

 const chessPgn = "[Event \"Chess.com\"]\n[White \"Tester\"]\n[Black \"Opponent\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 Nc6 1-0"
 const chessRaw = [{
  uuid: "chess-1", url: "https://www.chess.com/game/live/1", time_class: "rapid", time_control: "600+5", end_time: 1700000000,
  white: { username: "Tester", rating: 900, result: "win" }, black: { username: "Opponent", rating: 910, result: "resigned" }, pgn: chessPgn,
 }]
 const lichessRaw = [{
  id: "lichess-1", moves: "e4 e5 Nf3 Nc6", variant: "standard", status: "resign", winner: "white", speed: "rapid", perf: "rapid",
  clock: { initial: 600, increment: 5 }, createdAt: 1699999900000, lastMoveAt: 1700000000000,
  players: { white: { user: { name: "Tester" }, rating: 900 }, black: { user: { name: "Opponent" }, rating: 910 } },
 }]

 const chessGames = normalizeChessComGames(chessRaw, "Tester")
 const lichessGames = normalizeLichessGames(lichessRaw, "Tester").games
 assert.equal(chessGames.length, 1, "Chess.com-only normalization")
 assert.equal(lichessGames.length, 1, "Lichess-only normalization")
 assert.match(lichessGames[0].pgn, /1\. e4 e5 2\. Nf3 Nc6/, "legal Lichess SAN moves reconstruct PGN")
 assert.equal(reconstructLichessPgn("e2e4 e7e5", { userColor: "white", userResult: "draw", endTime: 1700000000 }, { white: "Tester", black: "Opponent" }).includes("1. e4 e5"), true)

 const mergedBoth = mergeConnectedGames([...chessGames, ...lichessGames])
 assert.equal(mergedBoth.games.length, 1, "cross-platform duplicate is removed")
 assert.equal(mergeConnectedGames(chessGames, chessGames).games.length, 0, "repeat import is idempotent against existing fingerprints")
 assert.equal(mergeConnectedGames(Array.from({ length: 151 }, (_, index) => ({ ...chessGames[0], sourceGameId: `game-${index}`, endTime: 1700001000 - index, fingerprint: `unique-${index}` }))).games.length, 150, "combined cap is exactly 150")

 const rejected = normalizeLichessGames([
  { ...lichessRaw[0], id: "variant", variant: "chess960" },
  { ...lichessRaw[0], id: "aborted", status: "aborted" },
  { ...lichessRaw[0], id: "empty", moves: "" },
  { ...lichessRaw[0], id: "malformed", moves: "badmove" },
  { ...lichessRaw[0], id: "illegal", moves: "e2e5" },
 ], "Tester")
 assert.equal(rejected.games.length, 0, "variant, aborted, malformed, empty, and illegal games are excluded")

 const response = (status, body) => new Response(body, { status, headers: { "content-type": "application/x-ndjson" } })
 await assert.rejects(() => fetchLichessExport("Tester", { fetchImpl: async () => response(404, "") }), (error) => error instanceof LichessExportError && error.code === "username_not_found")
 await assert.rejects(() => fetchLichessExport("Tester", { fetchImpl: async () => response(429, "") }), (error) => error instanceof LichessExportError && error.code === "rate_limited")
 const exported = await fetchLichessExport("Tester", { fetchImpl: async () => response(200, `${JSON.stringify(lichessRaw[0])}\n`) })
 assert.equal(exported.games.length, 1, "Lichess NDJSON export parser")

 assert.equal(sourceImportOutcome(["chess.com"], ["Lichess: unavailable"]).partial, true, "one-source partial success continues")
 assert.throws(() => sourceImportOutcome([], ["Chess.com: unavailable", "Lichess: unavailable"]), /Chess\.com/, "both-source failure stops")
 assert.equal(sourceForImportedGame({ source: "lichess" }), "lichess", "engine mistakes retain Lichess source")
 assert.equal(sourceForImportedGame({ source: "chess.com" }), "chess.com", "engine mistakes retain Chess.com source")

 const plan = buildPersonalTrainingPlan({
  detected_ratings: { rapid: 652 }, engine_analyzed_games_count: 30,
  engine_analysis_summary: buildSummary(Array.from({ length: 35 }, (_, index) => ({ severity: "mistake", phase: index < 28 ? "middlegame" : "endgame", time_class: "rapid", eval_loss_cp: 120 })), 30),
  opening_profile: { white: [], black: [] },
 })
 assert.equal(getRecommendedSection(plan).key, "tactics", "combined analysis affects the real personalized planner")

 console.log("PASS: connected-account import deterministic suite")
} finally {
 await vite.close()
}
