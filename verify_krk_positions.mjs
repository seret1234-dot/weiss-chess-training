import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Chess } from 'chess.js'

const INPUT_FILE = process.argv[2] || 'krk_generated.json'
const OUTPUT_FILE = process.argv[3] || 'krk_chunks_verified.json'
const REJECTED_FILE = process.argv[4] || 'krk_rejected.json'

const ENGINE_PATH = process.env.STOCKFISH_PATH || 'stockfish'
const MAX_MATE = Number(process.env.MAX_MATE || 10)
const MOVE_TIME_MS = Number(process.env.KRK_MOVETIME_MS || 300)
const CHUNK_SIZE = Number(process.env.KRK_CHUNK_SIZE || 30)

function normalizeFen(fen) {
  const trimmed = String(fen).trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length === 4) return `${trimmed} 0 1`
  if (parts.length === 5) return `${trimmed} 1`
  return trimmed
}

function extractCandidateFens(data) {
  const results = []

  function visit(node) {
    if (!node) return

    if (typeof node === 'string') {
      const trimmed = node.trim()
      if (trimmed.includes('/')) results.push(trimmed)
      return
    }

    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }

    if (typeof node === 'object') {
      if (typeof node.fen === 'string') {
        results.push(node.fen.trim())
      }

      for (const value of Object.values(node)) {
        visit(value)
      }
    }
  }

  visit(data)
  return [...new Set(results)]
}

function countPieces(game) {
  let wk = 0
  let wr = 0
  let bk = 0
  let total = 0

  const board = game.board()

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file]
      if (!piece) continue
      total += 1
      if (piece.type === 'k' && piece.color === 'w') wk += 1
      if (piece.type === 'r' && piece.color === 'w') wr += 1
      if (piece.type === 'k' && piece.color === 'b') bk += 1
    }
  }

  return { wk, wr, bk, total }
}

function getSquare(game, type, color) {
  const board = game.board()

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file]
      if (piece?.type === type && piece.color === color) {
        return `${'abcdefgh'[file]}${8 - rank}`
      }
    }
  }

  return null
}

function squareToCoords(square) {
  if (!square || square.length < 2) return null
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null
  return { file, rank }
}

function kingDistance(a, b) {
  const ca = squareToCoords(a)
  const cb = squareToCoords(b)
  if (!ca || !cb) return 99
  return Math.max(Math.abs(ca.file - cb.file), Math.abs(ca.rank - cb.rank))
}

function forceTurnFen(fen, turn) {
  const parts = normalizeFen(fen).split(/\s+/)
  parts[1] = turn
  return parts.join(' ')
}

function getCheck(game) {
  if (typeof game.inCheck === 'function') return game.inCheck()
  if (typeof game.isCheck === 'function') return game.isCheck()
  return false
}

function validateKrkFen(fen) {
  try {
    const game = new Chess(normalizeFen(fen))
    const pieces = countPieces(game)

    if (pieces.total !== 3) {
      return { ok: false, reason: 'not exactly 3 pieces' }
    }
    if (pieces.wk !== 1) {
      return { ok: false, reason: 'missing or extra white king' }
    }
    if (pieces.wr !== 1) {
      return { ok: false, reason: 'missing or extra white rook' }
    }
    if (pieces.bk !== 1) {
      return { ok: false, reason: 'missing or extra black king' }
    }
    if (game.turn() !== 'w') {
      return { ok: false, reason: 'not white to move' }
    }

    const wk = getSquare(game, 'k', 'w')
    const bk = getSquare(game, 'k', 'b')
    if (!wk || !bk) {
      return { ok: false, reason: 'king square missing' }
    }

    if (kingDistance(wk, bk) <= 1) {
      return { ok: false, reason: 'kings adjacent' }
    }

    const blackTurnGame = new Chess(forceTurnFen(game.fen(), 'b'))
    if (getCheck(blackTurnGame)) {
      return { ok: false, reason: 'black already in check on white turn' }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, reason: `invalid fen: ${err.message}` }
  }
}

function shuffleArray(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

class Engine {
  constructor(enginePath) {
    this.enginePath = enginePath
    this.proc = null
    this.lines = []
  }

  async start() {
    this.proc = spawn(this.enginePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.proc.stdout.setEncoding('utf8')
    this.proc.stderr.setEncoding('utf8')

    this.proc.stdout.on('data', (chunk) => {
      const text = String(chunk)
      const lines = text.split(/\r?\n/).filter(Boolean)
      this.lines.push(...lines)
    })

    this.proc.stderr.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (text) console.error('[stockfish stderr]', text)
    })

    this.proc.on('error', (err) => {
      console.error('[stockfish process error]', err)
    })

    this.send('uci')
    await this.waitForLine((line) => line === 'uciok', 10000)

    this.send('isready')
    await this.waitForLine((line) => line === 'readyok', 10000)

    this.send('setoption name Threads value 1')
    this.send('setoption name Hash value 32')
    this.send('isready')
    await this.waitForLine((line) => line === 'readyok', 10000)
  }

  send(cmd) {
    this.proc.stdin.write(`${cmd}\n`)
  }

  waitForLine(predicate, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const started = Date.now()

      const timer = setInterval(() => {
        for (const line of this.lines) {
          if (predicate(line)) {
            clearInterval(timer)
            resolve(line)
            return
          }
        }

        if (Date.now() - started > timeoutMs) {
          clearInterval(timer)
          reject(new Error(`Engine timeout after ${timeoutMs}ms`))
        }
      }, 20)
    })
  }

  async analyzeMate(fen) {
    this.lines = []

    this.send(`position fen ${normalizeFen(fen)}`)
    this.send(`go movetime ${MOVE_TIME_MS}`)

    await this.waitForLine((line) => line.startsWith('bestmove '), 5000)

    let mate = null
    let bestMove = null
    let evalCp = null

    for (const line of this.lines) {
      const mateMatch = line.match(/\bscore mate (-?\d+)\b/)
      if (mateMatch) mate = Number(mateMatch[1])

      const cpMatch = line.match(/\bscore cp (-?\d+)\b/)
      if (cpMatch) evalCp = Number(cpMatch[1]) / 100

      if (line.startsWith('bestmove ')) {
        const parts = line.split(/\s+/)
        if (parts[1] && parts[1] !== '(none)') {
          bestMove = parts[1]
        }
      }
    }

    return { mate, bestMove, eval: evalCp }
  }

  stop() {
    if (!this.proc) return
    this.send('quit')
  }
}

function buildChunks(verifiedByMate) {
  const chunks = []

  for (let mateIn = 1; mateIn <= MAX_MATE; mateIn += 1) {
    const positions = shuffleArray(verifiedByMate.get(mateIn) || [])

    for (let i = 0; i < positions.length; i += CHUNK_SIZE) {
      const slice = positions.slice(i, i + CHUNK_SIZE)
      const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1

      chunks.push({
        id: `m${mateIn}_c${chunkIndex}`,
        label: `Mate in ${mateIn}`,
        mateIn,
        positions: slice.map((entry) => ({
          fen: entry.fen,
          bestMove: entry.bestMove,
        })),
      })
    }
  }

  return { chunks }
}

async function main() {
  const inputPath = path.resolve(INPUT_FILE)
  const outputPath = path.resolve(OUTPUT_FILE)
  const rejectedPath = path.resolve(REJECTED_FILE)

  console.log(`Reading: ${inputPath}`)

  const rawText = await fs.readFile(inputPath, 'utf8')
  const rawData = JSON.parse(rawText)

  console.log(
    'Top-level keys:',
    typeof rawData === 'object' && rawData && !Array.isArray(rawData)
      ? Object.keys(rawData)
      : 'not object or array'
  )

  const extracted = extractCandidateFens(rawData)
  console.log(`Found raw FENs: ${extracted.length}`)

  if (extracted.length === 0) {
    throw new Error('No FENs found anywhere in input file')
  }

  const fens = [...new Set(extracted.map(normalizeFen))]
  console.log(`After dedupe: ${fens.length}`)

  const engine = new Engine(ENGINE_PATH)
  await engine.start()

  const verifiedByMate = new Map()
  const rejected = []

  for (let mateIn = 1; mateIn <= MAX_MATE; mateIn += 1) {
    verifiedByMate.set(mateIn, [])
  }

  for (let i = 0; i < fens.length; i += 1) {
    const fen = fens[i]
    console.log(`checking ${i + 1}/${fens.length}`)

    const basic = validateKrkFen(fen)
    if (!basic.ok) {
      rejected.push({ fen, reason: basic.reason })
      continue
    }

    let result
    try {
      result = await engine.analyzeMate(fen)
    } catch (err) {
      rejected.push({ fen, reason: `engine timeout: ${err.message}` })
      continue
    }

    const mate = result.mate

    if (!mate || mate <= 0 || mate > MAX_MATE || !result.bestMove) {
      rejected.push({
        fen,
        reason: `bad mate ${mate}, bestMove=${result.bestMove ?? 'null'}`,
      })
      continue
    }

    verifiedByMate.get(mate).push({
      fen,
      bestMove: result.bestMove,
      mate,
      eval: result.eval,
    })
  }

  engine.stop()

  const output = buildChunks(verifiedByMate)

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8')
  await fs.writeFile(rejectedPath, JSON.stringify(rejected, null, 2), 'utf8')

  console.log(`Saved verified chunks: ${outputPath}`)
  console.log(`Saved rejected list: ${rejectedPath}`)

  for (let mateIn = 1; mateIn <= MAX_MATE; mateIn += 1) {
    console.log(`Mate in ${mateIn}: ${verifiedByMate.get(mateIn).length}`)
  }

  console.log('done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})