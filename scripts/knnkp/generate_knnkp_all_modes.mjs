import fs from "fs"
import readline from "readline"
import { Chess } from "chess.js"
import { spawn } from "child_process"

const ROOT = "C:\\Users\\Ariel\\chess-trainer\\public\\data\\endgames\\knnkp"

const STOCKFISH =
  "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe"

const CHUNK_SIZE = 30
const MAX = 4000

// ---------- helpers ----------

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function sq(file, rank) {
  return file + rank
}

function filesNearEdge(edge) {
  return edge === "a" ? ["a", "b", "c"] : ["h", "g", "f"]
}

function ranksNearEdge(edge) {
  return edge === "1" ? ["1", "2", "3"] : ["8", "7", "6"]
}

function kingDistance(a, b) {
  const f = "abcdefgh"
  const af = f.indexOf(a[0])
  const bf = f.indexOf(b[0])
  const ar = Number(a[1])
  const br = Number(b[1])
  return Math.max(Math.abs(af - bf), Math.abs(ar - br))
}

// ---------- position builder ----------

function buildTemplate() {
  const corner = rand(["a1", "a8", "h1", "h8"])

  const edgeFile = corner[0]
  const edgeRank = corner[1]

  const bk = sq(edgeFile, edgeRank)

  const wk = sq(
    rand(filesNearEdge(edgeFile === "a" ? "a" : "h")),
    rand(ranksNearEdge(edgeRank === "1" ? "1" : "8"))
  )

  const n1 = sq(
    rand(["c", "d", "e", "f"]),
    rand(["3", "4", "5", "6"])
  )

  const n2 = sq(
    rand(["c", "d", "e", "f"]),
    rand(["3", "4", "5", "6"])
  )

  const bp = sq(
    rand(["a", "b", "g", "h"]),
    rand(["3", "4", "5", "6"])
  )

  return { wk, n1, n2, bk, bp }
}

function makeFen(pos) {
  const g = new Chess()
  g.clear()

  const { wk, n1, n2, bk, bp } = pos

  if (new Set([wk, n1, n2, bk, bp]).size !== 5) return null
  if (kingDistance(wk, bk) <= 1) return null

  try {
    g.put({ type: "k", color: "w" }, wk)
    g.put({ type: "n", color: "w" }, n1)
    g.put({ type: "n", color: "w" }, n2)
    g.put({ type: "k", color: "b" }, bk)
    g.put({ type: "p", color: "b" }, bp)

    const parts = g.fen().split(" ")
    parts[1] = "w"
    parts[2] = "-"
    parts[3] = "-"
    parts[4] = "0"
    parts[5] = "1"

    const fen = parts.join(" ")
    const test = new Chess(fen)

    // critical filters
    if (test.isCheck()) return null

    const flip = fen.split(" ")
    flip[1] = "b"
    if (new Chess(flip.join(" ")).isCheck()) return null

    if (test.isCheckmate()) return null
    if (test.isStalemate()) return null
    if (test.moves().length === 0) return null

    return fen
  } catch {
    return null
  }
}

// ---------- stockfish ----------

class SF {
  constructor(path) {
    this.e = spawn(path)
    this.lines = []
    this.waiters = []

    const rl = readline.createInterface({ input: this.e.stdout })

    rl.on("line", (line) => {
      this.lines.push(line)
      for (const w of [...this.waiters]) {
        if (w.test(line)) {
          w.resolve(line)
          this.waiters = this.waiters.filter((x) => x !== w)
        }
      }
    })
  }

  send(c) {
    this.e.stdin.write(c + "\n")
  }

  wait(test, t = 8000) {
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter)
        rej("timeout")
      }, t)

      const waiter = {
        test,
        resolve: (l) => {
          clearTimeout(timer)
          res(l)
        },
      }

      this.waiters.push(waiter)
    })
  }

  async init() {
    console.log("Starting Stockfish...")
    this.send("uci")
    await this.wait((l) => l.trim() === "uciok")
    this.send("isready")
    await this.wait((l) => l.trim() === "readyok")
    console.log("Stockfish ready. Generating...")
  }

  async eval(fen) {
    this.lines = []

    this.send(`position fen ${fen}`)
    this.send("go movetime 120")

    try {
      await this.wait((l) => l.startsWith("bestmove"), 6000)
    } catch {
      return null
    }

    const s = this.lines.filter((l) => l.includes(" score "))
    if (!s.length) return null

    const last = s[s.length - 1]

    const m = last.match(/score mate (-?\d+)/)
    if (m) return { type: "mate", v: Number(m[1]) }

    const cp = last.match(/score cp (-?\d+)/)
    if (cp) return { type: "cp", v: Number(cp[1]) }

    return null
  }

  close() {
    this.send("quit")
  }
}

// ---------- run ----------

const sf = new SF(STOCKFISH)
await sf.init()

const conv = []
const draw = []
const forced = {}
const seen = new Set()

for (let i = 1; i <= MAX; i++) {
  if (i % 50 === 0) {
    const fCount = Object.values(forced).reduce((s, a) => s + a.length, 0)
    console.log(
      `checking ${i}/${MAX} | conv ${conv.length} | draw ${draw.length} | forced ${fCount}`
    )
  }

  const fen = makeFen(buildTemplate())
  if (!fen || seen.has(fen)) continue
  seen.add(fen)

  const r = await sf.eval(fen)
  if (!r) continue

  if (r.type === "mate" && r.v > 0 && r.v <= 20) {
    if (!forced[r.v]) forced[r.v] = []
    if (forced[r.v].length < CHUNK_SIZE) forced[r.v].push({ fen })
  }

  if (r.type === "cp" && r.v > 150 && conv.length < 200) {
    conv.push({ fen })
  }

  if (r.type === "cp" && Math.abs(r.v) < 80 && draw.length < 120) {
    draw.push({ fen })
  }
}

sf.close()

function write(base, data) {
  fs.rmSync(base + "\\chunks", { recursive: true, force: true })
  fs.mkdirSync(base + "\\chunks", { recursive: true })

  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    fs.writeFileSync(
      `${base}\\chunks\\chunk_${String(i / CHUNK_SIZE + 1).padStart(3, "0")}.json`,
      JSON.stringify({ positions: data.slice(i, i + CHUNK_SIZE) }, null, 2)
    )
  }
}

function writeForced(base, forced) {
  fs.rmSync(base + "\\chunks", { recursive: true, force: true })
  fs.mkdirSync(base + "\\chunks", { recursive: true })

  Object.entries(forced).forEach(([d, arr]) => {
    fs.writeFileSync(
      `${base}\\chunks\\mate_${String(d).padStart(3, "0")}.json`,
      JSON.stringify({ positions: arr }, null, 2)
    )
  })
}

write(ROOT + "\\conversion", conv)
write(ROOT + "\\draw-awareness", draw)
writeForced(ROOT + "\\forced-mate", forced)

console.log("DONE")
console.log(`conversion: ${conv.length}`)
console.log(`draw: ${draw.length}`)
console.log(
  `forced: ${Object.values(forced).reduce((s, a) => s + a.length, 0)}`
)