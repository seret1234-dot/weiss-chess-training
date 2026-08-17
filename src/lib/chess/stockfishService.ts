import type { EvalInfo } from "./playComputerTypes"

export type EngineConfig = {
  skillLevel: number
  depth?: number
  moveTime?: number
}

export type BestMoveResult = {
  bestMove: string
  ponder?: string
  eval?: EvalInfo
}

export type EngineLine = {
  multipv: number
  bestMove: string
  pv: string[]
  scoreCp?: number
  mate?: number
  depth?: number
}

type PendingBestMove = {
  resolve: (value: BestMoveResult) => void
  reject: (reason?: unknown) => void
  eval: EvalInfo
}

type PendingEval = {
  resolve: (value: EvalInfo) => void
  reject: (reason?: unknown) => void
  eval: EvalInfo
}

type PendingLines = {
  resolve: (value: EngineLine[]) => void
  reject: (reason?: unknown) => void
  lines: Record<number, EngineLine>
}

function createWorker(): Worker {
  return new Worker("/stockfish/stockfish.js")
}

function isUciMove(value: string): boolean {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value)
}

export class StockfishService {
  private worker: Worker | null = null
  private isReady = false
  private initPromise: Promise<void> | null = null
  private currentConfig: EngineConfig = {
    skillLevel: 20,
    depth: 18,
    moveTime: 800,
  }

  private pendingBestMove: PendingBestMove | null = null
  private pendingEval: PendingEval | null = null
  private pendingLines: PendingLines | null = null

  async init(): Promise<void> {
    if (this.worker && this.isReady) return
    if (this.initPromise) return this.initPromise

    const worker = createWorker()
    this.worker = worker
    this.isReady = false

    const initPromise = new Promise<void>((resolve, reject) => {
      const fail = (reason: unknown) => {
        window.clearTimeout(timeout)
        if (this.worker === worker) {
          this.worker = null
          this.isReady = false
        }
        worker.onmessage = null
        worker.onerror = null
        worker.terminate()
        reject(reason)
      }

      const timeout = window.setTimeout(() => {
        fail(new Error("Stockfish init timeout"))
      }, 10000)

      worker.onmessage = (event: MessageEvent) => {
        if (this.worker !== worker) return
        const line = String(event.data || "")

        if (line === "readyok") {
          window.clearTimeout(timeout)
          this.isReady = true
          resolve()
          return
        }

        this.handleEngineLine(line)
      }

      worker.onerror = (err) => {
        fail(err)
      }

      worker.postMessage("uci")
      worker.postMessage("isready")
    })

    this.initPromise = initPromise

    try {
      await initPromise
    } finally {
      if (this.initPromise === initPromise) {
        this.initPromise = null
      }
    }
  }

  private handleEngineLine(line: string) {
    if (line.startsWith("info ")) {
      const evalInfo = this.parseInfoLine(line)

      if (this.pendingBestMove) {
        this.pendingBestMove.eval = {
          ...this.pendingBestMove.eval,
          ...evalInfo,
        }
      }

      if (this.pendingEval) {
        this.pendingEval.eval = {
          ...this.pendingEval.eval,
          ...evalInfo,
        }
      }

      if (this.pendingLines) {
        const parsed = this.parseMultiPvLine(line)

        if (parsed) {
          const previous = this.pendingLines.lines[parsed.multipv]
          const previousDepth = previous?.depth ?? -1
          const nextDepth = parsed.depth ?? -1

          if (!previous || nextDepth >= previousDepth) {
            this.pendingLines.lines[parsed.multipv] = parsed
          }
        }
      }

      return
    }

    if (!line.startsWith("bestmove ")) return

    const parts = line.split(/\s+/)
    const bestMove = parts[1] || ""
    const ponder = parts[3] || undefined

    if (this.pendingBestMove) {
      const pending = this.pendingBestMove
      this.pendingBestMove = null
      pending.resolve({
        bestMove,
        ponder,
        eval: {
          ...pending.eval,
          bestMove: pending.eval.bestMove || bestMove,
        },
      })
      return
    }

    if (this.pendingEval) {
      const pending = this.pendingEval
      this.pendingEval = null
      pending.resolve({
        ...pending.eval,
        bestMove: pending.eval.bestMove || bestMove,
      })
      return
    }

    if (this.pendingLines) {
      const pending = this.pendingLines
      this.pendingLines = null

      const lines = Object.values(pending.lines).sort(
        (a, b) => a.multipv - b.multipv,
      )

      if (lines.length === 0 && isUciMove(bestMove)) {
        lines.push({
          multipv: 1,
          bestMove,
          pv: [bestMove],
        })
      }

      pending.resolve(lines)
    }
  }

  private parseInfoLine(line: string): EvalInfo {
    const depthMatch = line.match(/\bdepth\s+(\d+)/)
    const mateMatch = line.match(/\bscore mate\s+(-?\d+)/)
    const cpMatch = line.match(/\bscore cp\s+(-?\d+)/)
    const pvMatch = line.match(/\bpv\s+(.+)$/)

    const pv = (pvMatch?.[1] || "")
      .trim()
      .split(/\s+/)
      .filter(isUciMove)

    const info: EvalInfo = {}

    if (depthMatch) info.depth = Number(depthMatch[1])
    if (mateMatch) info.mate = Number(mateMatch[1])
    if (cpMatch) info.scoreCp = Number(cpMatch[1])
    if (pv.length > 0) {
      info.bestMove = pv[0]
      info.pv = pv
    }

    return info
  }

  private parseMultiPvLine(line: string): EngineLine | null {
    const multipvMatch = line.match(/\bmultipv\s+(\d+)/)
    const depthMatch = line.match(/\bdepth\s+(\d+)/)
    const mateMatch = line.match(/\bscore mate\s+(-?\d+)/)
    const cpMatch = line.match(/\bscore cp\s+(-?\d+)/)
    const pvMatch = line.match(/\bpv\s+(.+)$/)

    const pv = (pvMatch?.[1] || "")
      .trim()
      .split(/\s+/)
      .filter(isUciMove)

    if (pv.length === 0) return null

    return {
      multipv: multipvMatch ? Number(multipvMatch[1]) : 1,
      bestMove: pv[0],
      pv,
      scoreCp: cpMatch ? Number(cpMatch[1]) : undefined,
      mate: mateMatch ? Number(mateMatch[1]) : undefined,
      depth: depthMatch ? Number(depthMatch[1]) : undefined,
    }
  }

  send(command: string) {
    if (!this.worker) return
    this.worker.postMessage(command)
  }

  private cancelPending(reason = "Stockfish search replaced") {
    const error = new Error(reason)

    if (this.pendingBestMove) {
      this.pendingBestMove.reject(error)
      this.pendingBestMove = null
    }

    if (this.pendingEval) {
      this.pendingEval.reject(error)
      this.pendingEval = null
    }

    if (this.pendingLines) {
      this.pendingLines.reject(error)
      this.pendingLines = null
    }
  }

  private beginSearch() {
    if (
      this.pendingBestMove ||
      this.pendingEval ||
      this.pendingLines
    ) {
      this.send("stop")
      this.cancelPending()
    }
  }

  setPosition(fen: string, moves?: string[]) {
    if (fen === "start") {
      const movePart =
        moves && moves.length ? ` moves ${moves.join(" ")}` : ""
      this.send(`position startpos${movePart}`)
      return
    }

    const movePart =
      moves && moves.length ? ` moves ${moves.join(" ")}` : ""
    this.send(`position fen ${fen}${movePart}`)
  }

  setSkill(config: EngineConfig) {
    this.currentConfig = config
    this.send(`setoption name Skill Level value ${config.skillLevel}`)
  }

  async getBestMove(fen: string): Promise<BestMoveResult> {
    if (!this.isReady) {
      throw new Error("Stockfish is not ready")
    }

    this.beginSearch()
    this.setPosition(fen)

    return new Promise<BestMoveResult>((resolve, reject) => {
      this.pendingBestMove = {
        resolve,
        reject,
        eval: {},
      }

      if (this.currentConfig.depth) {
        this.send(`go depth ${this.currentConfig.depth}`)
      } else {
        this.send(`go movetime ${this.currentConfig.moveTime ?? 800}`)
      }
    })
  }

  async getEvaluation(
    fen: string,
    options?: { depth?: number; moveTime?: number },
  ): Promise<EvalInfo> {
    if (!this.isReady) {
      throw new Error("Stockfish is not ready")
    }

    this.beginSearch()
    this.setPosition(fen)

    return new Promise<EvalInfo>((resolve, reject) => {
      this.pendingEval = {
        resolve,
        reject,
        eval: {},
      }

      if (options?.moveTime) {
        this.send(`go movetime ${options.moveTime}`)
      } else if (options?.depth) {
        this.send(`go depth ${options.depth}`)
      } else {
        this.send(
          `go depth ${Math.min(this.currentConfig.depth ?? 18, 14)}`,
        )
      }
    })
  }

  async getTopLines(
    fen: string,
    count = 3,
    options?: { depth?: number; moveTime?: number },
  ): Promise<EngineLine[]> {
    if (!this.isReady) {
      throw new Error("Stockfish is not ready")
    }

    const safeCount = Math.max(1, Math.min(5, Math.round(count)))
    this.beginSearch()
    this.setPosition(fen)

    return new Promise<EngineLine[]>((resolve, reject) => {
      this.pendingLines = {
        resolve,
        reject,
        lines: {},
      }

      this.send(`setoption name MultiPV value ${safeCount}`)

      if (options?.moveTime) {
        this.send(`go movetime ${options.moveTime}`)
      } else {
        this.send(
          `go depth ${Math.max(
            8,
            options?.depth ?? this.currentConfig.depth ?? 12,
          )}`,
        )
      }
    }).finally(() => {
      this.send("setoption name MultiPV value 1")
    })
  }

  stop() {
    this.send("stop")
  }

  private terminateWorker(reason: string) {
    const worker = this.worker

    this.worker = null
    this.isReady = false
    this.initPromise = null
    this.cancelPending(reason)

    if (!worker) return

    worker.onmessage = null
    worker.onerror = null
    worker.terminate()
  }

  async restart(): Promise<void> {
    this.terminateWorker("Stockfish was restarted")
    await this.init()
  }

  quit() {
    this.terminateWorker("Stockfish was closed")
  }
}

// Interactive play needs an engine it can restart without interrupting a
// long-running imported-game analysis. Keep the original export as an alias
// so existing interactive callers retain their current contract.
export const interactiveStockfishService = new StockfishService()
export const stockfishService = interactiveStockfishService

// Imported-game analysis runs independently from the interactive board. Each
// service owns its Worker, UCI configuration, and pending-search state.
export const backgroundAnalysisStockfishService = new StockfishService()
