import { Chess } from "chess.js"
import { supabase } from "../lib/supabase"
import { stockfishService } from "../lib/chess/stockfishService"
import type { EvalInfo } from "../lib/chess/playComputerTypes"

type ImportedGameRow = {
 id: string
 pgn: string
 time_class: string | null
 user_color: "white" | "black" | null
 engine_analyzed: boolean
}

export type EngineAnalysisProgress = {
 status: "starting" | "analyzing" | "saving" | "done" | "error"
 gamesDone: number
 gamesTotal: number
 currentGame?: number
 mistakesFound: number
 message: string
}

type AnalyzeOptions = {
 maxGames?: number
 depth?: number
 minLossCp?: number
 onProgress?: (progress: EngineAnalysisProgress) => void
}

function sleep(ms: number) {
 return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function evalInfoToCp(info?: EvalInfo): number | null {
 if (!info) return null

 if (typeof info.mate === "number") {
  const sign = info.mate > 0 ? 1 : -1
  return sign * Math.max(10000, 100000 - Math.abs(info.mate) * 1000)
 }

 if (typeof info.scoreCp === "number") return info.scoreCp

 return null
}

function userPerspectiveCp(info: EvalInfo | undefined, userIsSideToMove: boolean): number | null {
 const cp = evalInfoToCp(info)
 if (cp === null) return null
 return userIsSideToMove ? cp : -cp
}

function classifySeverity(lossCp: number) {
 if (lossCp >= 300) return "blunder"
 if (lossCp >= 150) return "mistake"
 return "inaccuracy"
}

function phaseFromPly(ply: number) {
 if (ply <= 16) return "opening"
 if (ply <= 50) return "middlegame"
 return "endgame"
}

function moveToUci(move: any) {
 return String(move?.from || "") + String(move?.to || "") + String(move?.promotion || "")
}

function sideFromTurn(turn: string): "white" | "black" {
 return turn === "w" ? "white" : "black"
}

function moveNumberFromPly(ply: number) {
 return Math.floor((ply + 1) / 2)
}

// Exported so the local Auto Study integration test can exercise the same
// persisted summary shape that production writes to user_auto_profile.
export function buildSummary(mistakes: any[], analyzedGames: number) {
 const bySeverity: Record<string, number> = {}
 const byPhase: Record<string, number> = {}
 const byTimeClass: Record<string, number> = {}

 let totalLossCp = 0

 for (const mistake of mistakes) {
  const severity = String(mistake.severity || "unknown")
  const phase = String(mistake.phase || "unknown")
  const timeClass = String(mistake.time_class || "unknown")

  bySeverity[severity] = (bySeverity[severity] || 0) + 1
  byPhase[phase] = (byPhase[phase] || 0) + 1
  byTimeClass[timeClass] = (byTimeClass[timeClass] || 0) + 1
  totalLossCp += Number(mistake.eval_loss_cp || 0)
 }

 return {
  analyzedGames,
  mistakes: mistakes.length,
  bySeverity,
  byPhase,
  byTimeClass,
  avgLossCp: mistakes.length ? Math.round(totalLossCp / mistakes.length) : 0,
  updatedAt: new Date().toISOString(),
 }
}

async function refreshProfileSummary(userId: string) {
 const { data: mistakes } = await supabase
  .from("user_engine_mistakes")
  .select("severity,phase,time_class,eval_loss_cp")
  .eq("user_id", userId)

 const { count: analyzedGames } = await supabase
  .from("user_imported_games")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userId)
  .eq("engine_analyzed", true)

 const rows = mistakes || []
 const summary = buildSummary(rows, analyzedGames || 0)

 await supabase
  .from("user_auto_profile")
  .upsert({
   user_id: userId,
   engine_analysis_status: "completed",
   engine_analysis_summary: summary,
   engine_analyzed_games_count: analyzedGames || 0,
   engine_analyzed_positions_count: rows.length,
   engine_last_analysis_at: new Date().toISOString(),
  })

 return summary
}

async function analyzeOneGame(
 userId: string,
 game: ImportedGameRow,
 depth: number,
 minLossCp: number,
) {
 if (!game.pgn || !game.user_color) return 0

 const loaded = new Chess()

 try {
  ;(loaded as any).loadPgn(game.pgn)
 } catch (error) {
  console.warn("Could not parse PGN:", game.id, error)
  return 0
 }

 const sans = loaded.history()
 const replay = new Chess()
 const mistakeRows: any[] = []

 for (let index = 0; index < sans.length; index += 1) {
  const ply = index + 1
  const sideToMove = sideFromTurn(replay.turn())
  const fenBefore = replay.fen()

  let userMove: any = null

  try {
   userMove = (replay as any).move(sans[index])
  } catch {
   userMove = null
  }

  if (!userMove) break

  if (sideToMove !== game.user_color) continue

  const userMoveUci = moveToUci(userMove)

  const best = await stockfishService.getBestMove(fenBefore)
  const bestMoveUci = best.bestMove || best.eval?.bestMove || ""

  const evalBeforeCp = userPerspectiveCp(best.eval, true)

  const evalAfter = await stockfishService.getEvaluation(replay.fen(), { depth })
  const evalAfterCp = userPerspectiveCp(evalAfter, false)

  if (evalBeforeCp === null || evalAfterCp === null) continue

  const lossCp = Math.max(0, Math.round(evalBeforeCp - evalAfterCp))

  if (lossCp >= minLossCp && bestMoveUci && bestMoveUci !== userMoveUci) {
   mistakeRows.push({
    user_id: userId,
    imported_game_id: game.id,
    source: "chess.com",
    time_class: game.time_class,
    user_color: game.user_color,
    move_number: moveNumberFromPly(ply),
    ply,
    phase: phaseFromPly(ply),
    fen_before: fenBefore,
    user_move_uci: userMoveUci,
    user_move_san: userMove.san || sans[index],
    best_move_uci: bestMoveUci,
    eval_before_cp: Math.round(evalBeforeCp),
    eval_after_cp: Math.round(evalAfterCp),
    eval_loss_cp: lossCp,
    severity: classifySeverity(lossCp),
   })
  }

  await sleep(20)
 }

 if (mistakeRows.length) {
  const { error } = await supabase
   .from("user_engine_mistakes")
   .upsert(mistakeRows, { onConflict: "user_id,imported_game_id,ply" })

  if (error) {
   console.error("Saving engine mistakes failed:", error)
   throw error
  }
 }

 await supabase
  .from("user_imported_games")
  .update({
   engine_analyzed: true,
   engine_analyzed_at: new Date().toISOString(),
  })
  .eq("user_id", userId)
  .eq("id", game.id)

 return mistakeRows.length
}

export async function analyzeImportedGamesWithStockfish(
 userId: string,
 options: AnalyzeOptions = {},
) {
 const maxGames = options.maxGames ?? 3
 const depth = options.depth ?? 8
 const minLossCp = options.minLossCp ?? 70

 options.onProgress?.({
  status: "starting",
  gamesDone: 0,
  gamesTotal: 0,
  mistakesFound: 0,
  message: "Starting Stockfish...",
 })

 await stockfishService.init()
 stockfishService.setSkill({ skillLevel: 20, depth })

 const { data: games, error } = await supabase
  .from("user_imported_games")
  .select("id,pgn,time_class,user_color,engine_analyzed")
  .eq("user_id", userId)
  .eq("engine_analyzed", false)
  .order("end_time", { ascending: false })
  .limit(maxGames)

 if (error) throw error

 const rows = (games || []) as ImportedGameRow[]
 let mistakesFound = 0

 options.onProgress?.({
  status: "analyzing",
  gamesDone: 0,
  gamesTotal: rows.length,
  mistakesFound,
  message: rows.length ? "Analyzing imported games..." : "No unanalyzed games found.",
 })

 for (let i = 0; i < rows.length; i += 1) {
  const game = rows[i]

  options.onProgress?.({
   status: "analyzing",
   gamesDone: i,
   gamesTotal: rows.length,
   currentGame: i + 1,
   mistakesFound,
   message: `Analyzing game ${i + 1} of ${rows.length}...`,
  })

  mistakesFound += await analyzeOneGame(userId, game, depth, minLossCp)

  options.onProgress?.({
   status: "saving",
   gamesDone: i + 1,
   gamesTotal: rows.length,
   currentGame: i + 1,
   mistakesFound,
   message: `Saved game ${i + 1} of ${rows.length}.`,
  })

  await sleep(80)
 }

 const summary = await refreshProfileSummary(userId)

 options.onProgress?.({
  status: "done",
  gamesDone: rows.length,
  gamesTotal: rows.length,
  mistakesFound,
  message: `Done. Found ${mistakesFound} new mistakes.`,
 })

 return {
  gamesAnalyzed: rows.length,
  mistakesFound,
  summary,
 }
}
