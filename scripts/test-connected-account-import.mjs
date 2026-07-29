import assert from "node:assert/strict"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
 const { normalizeChessComGames } = await vite.ssrLoadModule("/src/training/chesscomImport.ts")
 const { normalizeLichessGames, reconstructLichessPgn } = await vite.ssrLoadModule("/src/training/lichessImport.ts")
 const { ConnectedImportFailure, mergeConnectedGames, sourceImportOutcome, requestedConnectedSources, resolveSavedConnectedAccounts, hasUnsavedConnectedAccountChanges, requiresVisibleImportFailure } = await vite.ssrLoadModule("/src/training/importConnectedAccounts.ts")
 const { sourceForImportedGame, buildSummary, PENDING_ENGINE_ANALYSIS_FILTER, getAnalysisTiming, hasHonestAnalysisCompletion } = await vite.ssrLoadModule("/src/training/engineAnalyzeImportedGames.ts")
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
 assert.deepEqual(mergeConnectedGames(lichessGames).sourceCounts, { "chess.com": 0, lichess: 1 }, "Lichess-only final source naming is deterministic")
 assert.match(lichessGames[0].pgn, /1\. e4 e5 2\. Nf3 Nc6/, "legal Lichess SAN moves reconstruct PGN")
 assert.equal(reconstructLichessPgn("e2e4 e7e5", { userColor: "white", userResult: "draw", endTime: 1700000000 }, { white: "Tester", black: "Opponent" }).includes("1. e4 e5"), true)

 const mergedBoth = mergeConnectedGames([...chessGames, ...lichessGames])
 assert.equal(mergedBoth.games.length, 1, "cross-platform duplicate is removed")
 assert.equal(mergedBoth.crossSourceDuplicatesRemoved, 1, "cross-platform duplicate count is reported")
 assert.deepEqual(mergedBoth.sourceCounts, { "chess.com": 1, lichess: 0 }, "post-dedup source totals use the kept game")
 const existingChess = chessGames.map((game) => ({ ...game }))
 const repeated = mergeConnectedGames(chessGames, existingChess)
 assert.equal(repeated.games.length, 0, "repeat import is idempotent against existing fingerprints")
 assert.equal(repeated.alreadyPresent, 1, "existing same-source rows are reported as already present, not removed")
 assert.equal(repeated.crossSourceDuplicatesRemoved, 0, "same-source refresh does not report a cross-source duplicate")
 const cappedChessOnly = mergeConnectedGames(Array.from({ length: 151 }, (_, index) => ({ ...chessGames[0], sourceGameId: `game-${index}`, endTime: 1700001000 - index, fingerprint: `unique-${index}` })))
 assert.equal(cappedChessOnly.games.length, 150, "combined cap is exactly 150")
 assert.equal(cappedChessOnly.capExcluded, 1, "cap-excluded count is reported")
 assert.deepEqual(cappedChessOnly.sourceCounts, { "chess.com": 150, lichess: 0 }, "Chess.com-only final source naming is deterministic")
 const mixedForCap = [
  ...Array.from({ length: 100 }, (_, index) => ({ ...chessGames[0], sourceGameId: `chess-cap-${index}`, endTime: 2000 - index, fingerprint: `chess-cap-${index}` })),
  ...Array.from({ length: 100 }, (_, index) => ({ ...lichessGames[0], sourceGameId: `lichess-cap-${index}`, endTime: 1000 - index, fingerprint: `lichess-cap-${index}` })),
 ]
 const cappedMixed = mergeConnectedGames(mixedForCap)
 assert.deepEqual(cappedMixed.sourceCounts, { "chess.com": 100, lichess: 50 }, "dual-source totals are calculated after the cap")
 assert.equal(cappedMixed.capExcluded, 50, "dual-source cap-excluded count is reported")
 assert.deepEqual(requestedConnectedSources("", "arielweiss"), ["lichess"], "an empty Chess.com field never requests Chess.com")
 assert.deepEqual(requestedConnectedSources("ariel1234567891", ""), ["chess.com"], "a Chess.com-only refresh requests only Chess.com")

 const profileWinsOverStaleMetadata = resolveSavedConnectedAccounts(
  { chesscom_username: "", lichess_username: "arielweiss" },
  { chess_com_username: "stale-chess", lichess_username: "stale-lichess" },
 )
 assert.deepEqual(profileWinsOverStaleMetadata, { chesscom: "", lichess: "arielweiss" }, "saved profile values override stale auth metadata")
 assert.equal(hasUnsavedConnectedAccountChanges("", "arielweiss", "", "arielweiss"), false, "just-saved Lichess username can be passed directly to import")
 assert.equal(hasUnsavedConnectedAccountChanges("", "arielweiss", "stale-chess", ""), true, "refresh cannot silently use stale saved account state")
 const lichessFailure = new ConnectedImportFailure("Lichess: rate limited", { total: 112, sourceCounts: { "chess.com": 112, lichess: 0 } })
 assert.equal(lichessFailure.retainedGamesCount, 112, "a failed Lichess import preserves and reports the existing Chess.com total")
 assert.deepEqual(lichessFailure.retainedSourceCounts, { "chess.com": 112, lichess: 0 }, "a failed Lichess import names retained rows by source")
 assert.equal(requiresVisibleImportFailure(["lichess"], 0), true, "a failed Lichess-only refresh cannot show success when no rows were added")
 assert.equal(requiresVisibleImportFailure(["lichess"], 3), false, "a one-source partial success may continue when another source added games")

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
 assert.equal(PENDING_ENGINE_ANALYSIS_FILTER, "engine_analyzed.is.false,engine_analyzed.is.null", "Lichess rows with null analysis state remain eligible")
 assert.deepEqual(getAnalysisTiming(0, 18, 74, 180000), { elapsedMs: 180000, estimatedRemainingMs: 560000 }, "analysis progress exposes an ETA based on completed-game average")
 assert.equal(hasHonestAnalysisCompletion(74, { gamesAnalyzed: 0 }), false, "newly imported rows cannot report false zero-analysis success")
 assert.equal(hasHonestAnalysisCompletion(74, { gamesAnalyzed: 1 }), true, "successful analysis completion is accepted")

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
