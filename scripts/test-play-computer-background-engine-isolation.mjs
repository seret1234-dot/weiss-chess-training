import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const originalWorker = globalThis.Worker
const originalWindow = globalThis.window

class FakeWorker {
 static instances = []

 constructor() {
  this.commands = []
  this.terminated = false
  this.onmessage = null
  this.onerror = null
  FakeWorker.instances.push(this)
 }

 postMessage(command) {
  this.commands.push(command)
  if (command === "isready") {
   queueMicrotask(() => this.emit("readyok"))
  }
 }

 terminate() {
  this.terminated = true
 }

 emit(line) {
  this.onmessage?.({ data: line })
 }
}

globalThis.Worker = FakeWorker
globalThis.window = {
 setTimeout: globalThis.setTimeout,
 clearTimeout: globalThis.clearTimeout,
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
 await Promise.all([
  vite.transformRequest("/src/lib/chess/stockfishService.ts"),
  vite.transformRequest("/src/training/engineAnalyzeImportedGames.ts"),
  vite.transformRequest("/src/pages/PlayComputerPage.tsx"),
 ])

 const serviceModule = await vite.ssrLoadModule("/src/lib/chess/stockfishService.ts")
 const { StockfishService, interactiveStockfishService, backgroundAnalysisStockfishService } = serviceModule
 const [serviceSource, analyzerSource, playSource] = await Promise.all([
  readFile(new URL("../src/lib/chess/stockfishService.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/training/engineAnalyzeImportedGames.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/PlayComputerPage.tsx", import.meta.url), "utf8"),
 ])

 // The application exports two independently owned services, so an imported
 // game search cannot stop or resolve the interactive worker's request.
 assert.notEqual(interactiveStockfishService, backgroundAnalysisStockfishService, "interactive and background engines are different instances")
 assert.match(serviceSource, /export const interactiveStockfishService = new StockfishService\(\)/, "interactive service is explicit")
 assert.match(serviceSource, /export const backgroundAnalysisStockfishService = new StockfishService\(\)/, "background service is explicit")
 assert.match(analyzerSource, /import \{ backgroundAnalysisStockfishService \}/, "background analyzer imports only its engine")
 assert.doesNotMatch(analyzerSource, /import \{ stockfishService \}/, "background analyzer cannot use the interactive singleton")
 assert.match(playSource, /import \{ stockfishService \}/, "Play Computer remains on the interactive service")

 // This reproduces the previous failure contract: overlapping requests on one
 // service cancel the earlier search. Two services must instead complete both.
 const oneService = new StockfishService()
 await oneService.init()
 const cancelled = oneService.getBestMove("start")
 const replacement = oneService.getEvaluation("start")
 await assert.rejects(cancelled, /Stockfish search replaced/, "one worker rejects a displaced pending search")
 FakeWorker.instances.at(-1).emit("bestmove e2e4")
 await replacement
 oneService.quit()

 const interactive = new StockfishService()
 const background = new StockfishService()
 await Promise.all([interactive.init(), background.init()])
 const interactiveWorker = FakeWorker.instances.at(-2)
 const backgroundWorker = FakeWorker.instances.at(-1)
 const interactiveSearch = interactive.getBestMove("start")
 const backgroundSearch = background.getEvaluation("start")
 assert.equal(interactiveWorker.commands.includes("stop"), false, "background search does not stop interactive search")
 assert.equal(backgroundWorker.commands.includes("stop"), false, "interactive search does not stop background search")
 backgroundWorker.emit("bestmove d2d4")
 assert.equal((await backgroundSearch).bestMove, "d2d4", "background analysis completes during interactive play")

 // A background stop/restart remains local. Its new worker may continue the
 // next analysis request while the existing interactive search is unaffected.
 background.stop()
 await background.restart()
 assert.equal(interactiveWorker.terminated, false, "background restart does not terminate interactive worker")
 interactiveWorker.emit("bestmove e2e4")
 assert.equal((await interactiveSearch).bestMove, "e2e4", "interactive move completes during background analysis")
 const resumedBackgroundWorker = FakeWorker.instances.at(-1)
 const resumedBackgroundSearch = background.getEvaluation("start")
 resumedBackgroundWorker.emit("bestmove c2c4")
 assert.equal((await resumedBackgroundSearch).bestMove, "c2c4", "background progress can continue after an interactive move")

 // Recovery restarts only the interactive worker. The background worker and
 // its ownership remain intact while the interactive FEN is retried once.
 await interactive.restart()
 assert.equal(interactiveWorker.terminated, true, "interactive recovery terminates only its prior worker")
 assert.equal(resumedBackgroundWorker.terminated, false, "interactive recovery does not terminate background worker")
 background.quit()
 interactive.quit()

 assert.match(playSource, /await stockfishService\.restart\(\)/, "Play Computer retries after an interactive-only restart")
 assert.match(playSource, /chessRef\.current\.fen\(\) !== requestedFen/, "stale best moves are rejected when the board changes")
 assert.match(playSource, /Retry Computer Move/, "a persistent failure exposes a user retry action")

 console.log("PASS: Play Computer and background analysis use isolated Stockfish workers with interactive recovery")
} finally {
 await vite.close()
 if (originalWorker === undefined) delete globalThis.Worker
 else globalThis.Worker = originalWorker
 if (originalWindow === undefined) delete globalThis.window
 else globalThis.window = originalWindow
}
