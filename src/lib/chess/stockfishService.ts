import type { EvalInfo } from './playComputerTypes'

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

function createWorker(): Worker {
  return new Worker('/stockfish/stockfish.js')
}

export class StockfishService {
  private worker: Worker | null = null
  private isReady = false
  private currentConfig: EngineConfig = {
    skillLevel: 20,
    depth: 18,
    moveTime: 800,
  }

  private pendingBestMove: PendingBestMove | null = null
  private pendingEval: PendingEval | null = null

  async init(): Promise<void> {
    if (this.worker && this.isReady) return

    this.worker = createWorker()

    await new Promise<void>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Failed to create Stockfish worker'))
        return
      }

      const timeout = window.setTimeout(() => {
        reject(new Error('Stockfish init timeout'))
      }, 10000)

      this.worker.onmessage = (event: MessageEvent) => {
        const line = String(event.data || '')

        if (line === 'readyok') {
          window.clearTimeout(timeout)
          this.isReady = true
          resolve()
          return
        }

        this.handleEngineLine(line)
      }

      this.worker.onerror = (err) => {
        window.clearTimeout(timeout)
        reject(err)
      }

      this.send('uci')
      this.send('isready')
    })
  }

  private handleEngineLine(line: string) {
    if (line.startsWith('info ')) {
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

      return
    }

    if (line.startsWith('bestmove ')) {
      const parts = line.split(/\s+/)
      const bestMove = parts[1] || ''
      const ponder = parts[3] || undefined

      if (this.pendingBestMove) {
        const pending = this.pendingBestMove
        this.pendingBestMove = null
        pending.resolve({
          bestMove,
          ponder,
          eval: pending.eval,
        })
        return
      }

      if (this.pendingEval) {
        const pending = this.pendingEval
        this.pendingEval = null
        pending.resolve(pending.eval)
      }
    }
  }

  private parseInfoLine(line: string): EvalInfo {
    const depthMatch = line.match(/\bdepth\s+(\d+)/)
    const mateMatch = line.match(/\bscore mate\s+(-?\d+)/)
    const cpMatch = line.match(/\bscore cp\s+(-?\d+)/)
    const pvMatch = line.match(/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/)

    const info: EvalInfo = {}

    if (depthMatch) info.depth = Number(depthMatch[1])
    if (mateMatch) info.mate = Number(mateMatch[1])
    if (cpMatch) info.scoreCp = Number(cpMatch[1])
    if (pvMatch) info.bestMove = pvMatch[1]

    return info
  }

  private send(command: string) {
    if (!this.worker) return
    this.worker.postMessage(command)
  }

  setPosition(fen: string, moves?: string[]) {
    if (fen === 'start') {
      const movePart = moves && moves.length ? ` moves ${moves.join(' ')}` : ''
      this.send(`position startpos${movePart}`)
      return
    }

    const movePart = moves && moves.length ? ` moves ${moves.join(' ')}` : ''
    this.send(`position fen ${fen}${movePart}`)
  }

  setSkill(config: EngineConfig) {
    this.currentConfig = config
    this.send(`setoption name Skill Level value ${config.skillLevel}`)
  }

  async getBestMove(fen: string): Promise<BestMoveResult> {
    if (!this.isReady) {
      throw new Error('Stockfish is not ready')
    }

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

  async getEvaluation(fen: string): Promise<EvalInfo> {
    if (!this.isReady) {
      throw new Error('Stockfish is not ready')
    }

    this.setPosition(fen)

    return new Promise<EvalInfo>((resolve, reject) => {
      this.pendingEval = {
        resolve,
        reject,
        eval: {},
      }

      this.send(`go depth ${Math.min(this.currentConfig.depth ?? 18, 14)}`)
    })
  }

  stop() {
    this.send('stop')
  }

  quit() {
    this.send('quit')
    this.worker?.terminate()
    this.worker = null
    this.isReady = false
    this.pendingBestMove = null
    this.pendingEval = null
  }
}

export const stockfishService = new StockfishService()