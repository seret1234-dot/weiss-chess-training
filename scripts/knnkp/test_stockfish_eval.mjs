import fs from "fs"
import readline from "readline"
import { Chess } from "chess.js"
import { spawn } from "child_process"

const ROOT = "C:\\Users\\Ariel\\chess-trainer\\public\\data\\endgames\\knnkp"

const STOCKFISH =
  "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe"

const CHUNK_SIZE = 30
const MAX = 3000

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function squareCoords(sq) {
  return {
    file: "abcdefgh".indexOf(sq[0]),
    rank: Number(sq[1]),
  }
}

function kingDistance(a, b) {
  const aa = squareCoords(a)
  const bb = squareCoords(b)
  return Math.max(Math.abs(aa.file - bb.file), Math.abs(aa.rank - bb.rank))
}

function makeFen(wk, n1, n2, bk, bp) {
  const g = new Chess()
  g.clear()

  try {
    g.put({ type: "k", color: "w" }, wk)
    g.put({ type: "n", color: "w" }, n1)
    g.put({ type: "n", color: "w" }, n2)
    g.put({ type: "k", color: "b" }, bk)
    g.put({ type: "p", color: "b" }, bp)

    if (kingDistance(wk, bk) <= 1) return null

    const parts = g.fen().split(" ")
    parts[1] = "w"
    parts[2] = "-"
    parts[3] = "-"
    parts[4] = "0"
    parts[5] = "1"

    const fen = parts.join(" ")
    const test = new Chess(fen)

    if (test.isCheckmate()) return null
    if (test.isStalemate()) return null
    if (test.moves().length === 0) return null

    return fen
  } catch {
    return null
  }
}

const files = "abcdefgh"
const pawnRanks = "234567"
const pieceRanks = "12345678"

function randomSquare(ranks = pieceRanks) {
  return rand(files) + rand(ranks)
}

function generateFen() {
  for (let i = 0; i < 300; i++) {
    const wk = randomSquare()
    const bk = randomSquare()
    const n1 = randomSquare()
    const n2 = randomSquare()
    const bp = randomSquare(pawnRanks)

    const all = [wk, bk, n1, n2, bp]
    if (new Set(all).size !== 5) continue
    if (kingDistance(wk, bk) <= 1) continue

    const fen = makeFen(wk, n1, n2, bk, bp)
    if (fen) return fen
  }

  return null
}

class Stockfish {
  constructor(path) {
    this.engine = spawn(path)
    this.lines = []
    this.waiters = []

    const rl = readline.createInterface({ input: this.engine.stdout })

    rl.on("line", (line) => {
      this.lines.push(line)
      for (const waiter of [...this.waiters]) {
        if (waiter.test(line)) {
          waiter.resolve(line)
          this.waiters = this.waiters.filter((w) => w !== waiter)
        }
      }
    })

    this.engine.stderr.on("data", (d) => {
      const text = d.toString()
      if (text.trim()) console.error(text)
    })
  }

  send(cmd) {
    this.engine.stdin.write(cmd + "\n")
  }

  waitFor(test, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter)
        reject(new Error("Stockfish timeout"))
      }, timeoutMs)

      const waiter = {
        test,
        resolve: (line) => {
          clearTimeout(timer)
          resolve(line)
        },
      }

      this.waiters.push(waiter)
    })
  }

  async init() {
    this.send("uci")
    await this.waitFor((line) => line === "uciok")
    this.send("isready")
    await this.waitFor((line) => line === "readyok")
  }

  async analyze(fen) {
    this.lines = []

    this.send(`position fen ${fen}`)
    this.send("go depth 10")

    await this.waitFor((line) => line.startsWith("bestmove"), 15000)

    const scoreLines = this.lines.filter((l) => l.includes(" score "))
    if (!scoreLines.length) return null

    const last = scoreLines[scoreLines.length - 1]

    const mate = last.match(/score mate (-?\d+)/)
    if (mate) return { type: "mate", v: Number(mate[1]) }

    const cp = last.match(/score cp (-?\d+)/)
    if (cp) return { type: "cp", v: Number(cp[1]) }

    return null
  }

  close() {
    this.send("quit")
  }
}

function clearChunks(base) {
  fs.rmSync(base + "\\chunks", { recursive: true, force: true })
  fs.mkdirSync(base + "\\chunks", { recursive: true })
}

function writeLinearMode(base, key, label, data, mode) {
  clearChunks(base)

  const chunks = []
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    chunks.push(data.slice(i, i + CHUNK_SIZE))
  }

  const chunkFiles = chunks.map(
    (_, i) => `chunk_${String(i + 1).padStart(3, "0")}.json`
  )

  chunks.forEach((chunk, i) => {
    fs.writeFileSync(
      `${base}\\chunks\\${chunkFiles[i]}`,
      JSON.stringify({ positions: chunk }, null, 2)
    )
  })

  fs.writeFileSync(
    `${base}\\progression.json`,
    JSON.stringify(
      {
        order: [key],
        themes: {
          [key]: {
            id: key,
            label,
            chunkFiles,
            masteryFastSolves: 5,
            maxSecondsPerMove: 3,
            goal: mode === "evaluate" ? "evaluate" : "convert",
            mode,
          },
        },
        masteryFastSolves: 5,
        maxSecondsPerMove: 3,
        chunkSize: CHUNK_SIZE,
      },
      null,
      2
    )
  )
}

function writeForcedMateMode(base, forced) {
  clearChunks(base)

  const mateDistances = Object.keys(forced)
    .map(Number)
    .sort((a, b) => a - b)

  const order = []
  const themes = {}

  for (const d of mateDistances) {
    const positions = forced[d] || []
    if (!positions.length) continue

    const themeId = `mate-${String(d).padStart(3, "0")}`
    const file = `mate_${String(d).padStart(3, "0")}_chunk_001.json`

    fs.writeFileSync(
      `${base}\\chunks\\${file}`,
      JSON.stringify({ positions }, null, 2)
    )

    order.push(themeId)
    themes[themeId] = {
      id: themeId,
      label: `Mate in ${d}`,
      chunkFiles: [file],
      masteryFastSolves: 5,
      maxSecondsPerMove: 3,
      goal: "checkmate",
      mode: "convert",
    }
  }

  fs.writeFileSync(
    `${base}\\progression.json`,
    JSON.stringify(
      {
        order,
        themes,
        masteryFastSolves: 5,
        maxSecondsPerMove: 3,
        chunkSize: CHUNK_SIZE,
      },
      null,
      2
    )
  )
}

const engine = new Stockfish(STOCKFISH)
await engine.init()

const conversion = []
const draw = []
const forced = {}
const seen = new Set()

for (let attempts = 1; attempts <= MAX; attempts++) {
  if (attempts % 50 === 0) {
    const forcedCount = Object.values(forced).reduce((s, a) => s + a.length, 0)
    console.log(
      `checking ${attempts}/${MAX} | conv ${conversion.length} | draw ${draw.length} | forced ${forcedCount}`
    )
  }

  const fen = generateFen()
  if (!fen || seen.has(fen)) continue
  seen.add(fen)

  const evalRes = await engine.analyze(fen)
  if (!evalRes) continue

  if (evalRes.type === "mate" && evalRes.v > 0 && evalRes.v <= 25) {
    if (!forced[evalRes.v]) forced[evalRes.v] = []

    if (forced[evalRes.v].length < CHUNK_SIZE) {
      forced[evalRes.v].push({
        id: `forced_mate_${String(evalRes.v).padStart(3, "0")}_${String(
          forced[evalRes.v].length + 1
        ).padStart(3, "0")}`,
        label: `Forced mate in ${evalRes.v}`,
        fen,
        mateDistance: evalRes.v,
        result: "win",
        theme: `mate-${evalRes.v}`,
        explanation: `Stockfish confirms mate in ${evalRes.v}.`,
      })
    }
  }

  if (evalRes.type === "cp" && evalRes.v > 200 && conversion.length < 240) {
    conversion.push({
      id: `conversion_${String(conversion.length + 1).padStart(4, "0")}`,
      label: `KNNKP Conversion #${conversion.length + 1}`,
      fen,
      result: "win",
      theme: "conversion",
      explanation:
        "Keep the pawn as a tempo resource. Do not simplify into bare KNN vs K too early.",
    })
  }

  if (evalRes.type === "cp" && Math.abs(evalRes.v) < 50 && draw.length < 120) {
    draw.push({
      id: `draw_awareness_${String(draw.length + 1).padStart(4, "0")}`,
      label: `KNNKP Draw Awareness #${draw.length + 1}`,
      fen,
      result: "draw",
      theme: "draw-awareness",
      explanation:
        "This position is not clearly winning. Learn when KNNKP cannot force progress.",
    })
  }
}

engine.close()

writeLinearMode(
  ROOT + "\\conversion",
  "conversion",
  "KNNKP Conversion",
  conversion,
  "convert"
)

writeForcedMateMode(ROOT + "\\forced-mate", forced)

writeLinearMode(
  ROOT + "\\draw-awareness",
  "draw-awareness",
  "KNNKP Draw Awareness",
  draw,
  "evaluate"
)

console.log("DONE")
console.log(`conversion: ${conversion.length}`)
console.log(`draw-awareness: ${draw.length}`)
console.log(
  `forced-mate: ${Object.values(forced).reduce((s, a) => s + a.length, 0)}`
)
console.log(
  `forced mate distances: ${Object.keys(forced)
    .sort((a, b) => Number(a) - Number(b))
    .join(", ")}`
)