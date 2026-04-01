import stockfishUrl from 'stockfish/bin/stockfish.js?url'

export type EngineResult = {
  bestMove: string | null
  eval: number | null
  mate: number | null
}

export class BNEngine {
  private worker: Worker
  private resolve?: (r: EngineResult) => void
  private lastEval: number | null = null
  private lastMate: number | null = null

  constructor() {
    this.worker = new Worker(stockfishUrl, { type: 'module' })
    this.worker.onmessage = (e) => this.handleMessage(e.data)

    this.send('uci')
  }

  destroy() {
    this.worker.terminate()
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd)
  }

  private handleMessage(line: unknown) {
    if (typeof line !== 'string') return

    if (line === 'uciok') {
      this.send('isready')
      return
    }

    if (line === 'readyok') {
      return
    }

    if (line.includes('score cp')) {
      const m = line.match(/score cp (-?\d+)/)
      if (m) this.lastEval = parseInt(m[1], 10)
    }

    if (line.includes('score mate')) {
      const m = line.match(/score mate (-?\d+)/)
      if (m) this.lastMate = parseInt(m[1], 10)
    }

    if (line.startsWith('bestmove')) {
      const parts = line.split(' ')
      const bestMove = parts[1] ?? null

      if (this.resolve) {
        this.resolve({
          bestMove,
          eval: this.lastEval,
          mate: this.lastMate,
        })
      }

      this.resolve = undefined
      this.lastEval = null
      this.lastMate = null
    }
  }

  analyze(fen: string, depth = 14): Promise<EngineResult> {
    return new Promise((resolve) => {
      this.resolve = resolve

      this.send('stop')
      this.send('ucinewgame')
      this.send(`position fen ${fen}`)
      this.send(`go depth ${depth}`)
    })
  }
}