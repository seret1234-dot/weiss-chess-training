import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const originalWindow = globalThis.window
globalThis.window = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
 await Promise.all([
  vite.transformRequest("/src/training/engineAnalyzeImportedGames.ts"),
  vite.transformRequest("/src/context/BackgroundAnalysisContext.tsx"),
  vite.transformRequest("/src/pages/PlayComputerPage.tsx"),
  vite.transformRequest("/src/pages/analyze/AnalyzeBoardPage.tsx"),
 ])

 const engine = await vite.ssrLoadModule("/src/training/engineAnalyzeImportedGames.ts")
 const [engineSource, providerSource, playSource, autoSource, boardSource] = await Promise.all([
  readFile(new URL("../src/training/engineAnalyzeImportedGames.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/context/BackgroundAnalysisContext.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/PlayComputerPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/AutoStudyPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/analyze/AnalyzeBoardPage.tsx", import.meta.url), "utf8"),
 ])

 // 1?5. A non-resolving background search times out, restarts only the supplied
 // background worker, retries the same operation once, then fails boundedly.
 let attempts = 0
 let restarts = 0
 const retryResult = await engine.runBackgroundEngineRequest(
  () => {
   attempts += 1
   return attempts === 1 ? new Promise(() => {}) : Promise.resolve("same-fen-result")
  },
  { timeoutMs: 5, restart: async () => { restarts += 1 } },
 )
 assert.equal(retryResult, "same-fen-result", "watchdog retries the identical request after a stall")
 assert.equal(attempts, 2, "stalled request is attempted once more")
 assert.equal(restarts, 1, "watchdog restarts only the injected background engine")
 await assert.rejects(
  engine.runBackgroundEngineRequest(() => new Promise(() => {}), {
   timeoutMs: 5,
   restart: async () => {},
  }),
  /Background Stockfish search timed out/,
  "a bounded retry records a terminal per-game failure instead of waiting forever",
 )
 assert.match(engineSource, /fenBefore/, "best-move retry closes over the exact pre-move FEN")
 assert.match(engineSource, /const fenAfter = replay\.fen\(\)/, "evaluation retry closes over the exact post-move FEN")
 assert.match(engineSource, /await markGameAnalyzed\(userId, game\.id\)/, "bounded game failures are checkpointed and cannot block the plan")

 // 6?8. Progress is persisted per completed game; reload preserves the prior
 // total/progress and skips import when its explicit completion marker is set.
 assert.match(providerSource, /importCompleted: boolean/, "job persists explicit import completion")
 assert.match(providerSource, /run\.status === "importing" && !run\.importCompleted/, "analyzing resume does not re-import")
 assert.match(providerSource, /run\.gamesCompleted \+ progress\.gamesDone/, "resume continues from the persisted completed-game checkpoint")
 assert.match(providerSource, /jobId/, "all provider updates remain run-scoped")

 // 9. The interactive engine remains separate; this worker watchdog imports
 // only backgroundAnalysisStockfishService while Play Computer keeps its alias.
 assert.match(engineSource, /backgroundAnalysisStockfishService\.restart\(\)/, "watchdog restarts only the background service")
 assert.match(playSource, /import \{ stockfishService \}/, "Play Computer retains the interactive engine")

 // Weekly entry starts Game 1 after readiness only. Game 2 and normal Play
 // Computer setup preserve their existing manual/continuation behavior.
 assert.match(autoSource, /navigate\("\/play-computer\?weekly=1"\)/, "Auto Study opens the weekly route")
 assert.match(playSource, /weeklyGameIndex !== 0 \|\| gameStarted \|\| !engineReady/, "weekly auto-start waits for engine readiness and only targets Game 1")
 assert.match(playSource, /startGame\(\)/, "weekly Game 1 is activated automatically")
 assert.match(playSource, /Start Weekly Game \$\{weeklyGameNumber\}/, "manual control remains available only before engine readiness/setup resolution")
 assert.match(playSource, /initialAutoStart =\s*!isWeeklyTest/, "normal non-weekly setup remains separate")

 // Desktop review uses the requested far-right Moves panel with the full
 // classification column visible and readable Review Details.
 assert.match(boardSource, /ANALYZE_REVIEW_SIDE_PANEL_WIDTH = 854/, "review workspace preserves its wide inner panel tracks with less outer chrome")
 assert.match(boardSource, /"review details moves"/, "Moves is the far-right review column")
 assert.match(boardSource, /minmax\(288px, 1fr\) minmax\(270px, 0\.95fr\) minmax\(248px, 0\.88fr\)/, "Review Details keeps a readable desktop width")
 assert.match(boardSource, /ANALYZE_REVIEW_MAX_BOARD_SIZE = 720/, "review board uses the larger desktop size")
 assert.match(boardSource, /className="analyze-classification-label"/, "classification labels retain their no-wrap desktop safety hook")
 assert.match(boardSource, /\.analyze-review-grid\.review-mode > :nth-child\(1\)[\s\S]*overflow: visible/, "classification panel no longer has an internal scrollbar")
 assert.match(boardSource, /\.analyze-moves-list/, "Moves retains its dedicated scrollable list")

 console.log("PASS: background watchdog/recovery, checkpoint resume, weekly Game 1 auto-start, and far-right Moves layout are wired")
} finally {
 await vite.close()
 if (originalWindow === undefined) delete globalThis.window
 else globalThis.window = originalWindow
}
