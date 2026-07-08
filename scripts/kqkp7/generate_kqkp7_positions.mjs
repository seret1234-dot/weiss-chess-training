import fs from "fs"
import path from "path"
import { spawn } from "child_process"
import { Chess } from "chess.js"

const ROOT = process.cwd()

const STOCKFISH_PATH = path.join(
  ROOT,
  "stockfish-windows-x86-64-avx2",
  "stockfish",
  "stockfish-windows-x86-64-avx2.exe"
)

const OUT_DIR = path.join(ROOT, "public", "data", "endgames", "kqkp7")
const CHUNKS_DIR = path.join(OUT_DIR, "chunks")

const CHUNK_SIZE = 30
const DEPTH = 16

const FILES = "abcdefgh"
const RANKS = "12345678"
const PAWN_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"]

const MAX_EVALUATION = 240

const MAX_CONVERSION_PER_THEME = {
  "rook-pawn": 90,
  "bishop-pawn": 90,
  "knight-pawn": 90,
  "central-pawn": 90,
  mixed: 120,
}

function square(file, rank) {
  return `${file}${rank}`
}

function squareIndex(sq) {
  return {
    f: FILES.indexOf(sq[0]),
    r: Number(sq[1]) - 1,
  }
}

function kingDistance(a, b) {
  const A = squareIndex(a)
  const B = squareIndex(b)
  return Math.max(Math.abs(A.f - B.f), Math.abs(A.r - B.r))
}

function kingsAdjacent(a, b) {
  return kingDistance(a, b) <= 1
}

function sameLine(a, b) {
  const A = squareIndex(a)
  const B = squareIndex(b)
  return A.f === B.f || A.r === B.r || Math.abs(A.f - B.f) === Math.abs(A.r - B.r)
}

function queenAttacksSquare(q, target, occupiedSquares = new Set()) {
  if (!sameLine(q, target)) return false

  const Q = squareIndex(q)
  const T = squareIndex(target)
  const df = Math.sign(T.f - Q.f)
  const dr = Math.sign(T.r - Q.r)

  let f = Q.f + df
  let r = Q.r + dr

  while (f !== T.f || r !== T.r) {
    const between = `${FILES[f]}${r + 1}`
    if (occupiedSquares.has(between)) return false
    f += df
    r += dr
  }

  return true
}

function blackPawnAttacks(pawnSq, targetSq) {
  const P = squareIndex(pawnSq)
  const T = squareIndex(targetSq)
  return T.r === P.r - 1 && Math.abs(T.f - P.f) === 1
}

function classifyTheme(pawnFile) {
  if (pawnFile === "a" || pawnFile === "h") return "rook-pawn"
  if (pawnFile === "c" || pawnFile === "f") return "bishop-pawn"
  if (pawnFile === "b" || pawnFile === "g") return "knight-pawn"
  return "central-pawn"
}

function explanationFor(theme, result, pawnSq) {
  if (result === "draw") {
    if (theme === "rook-pawn") {
      return `Draw resource: the defender is close enough to the rook-pawn corner near ${pawnSq}.`
    }
    if (theme === "bishop-pawn") {
      return `Draw resource: the defender may use stalemate/corner ideas near the bishop pawn on ${pawnSq}.`
    }
    return `Draw with correct defense. The defender is close enough to the pawn.`
  }

  if (theme === "rook-pawn") {
    return `Winning, but precise. White must avoid the corner draw and win the pawn.`
  }
  if (theme === "bishop-pawn") {
    return `Winning, but watch for stalemate resources. Win or neutralize the pawn.`
  }
  if (theme === "knight-pawn") {
    return `Winning. White can control promotion and win the pawn.`
  }
  return `Winning. White can use the queen and king to stop the pawn.`
}

function emptyBoard() {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ""))
}

function put(board, sq, piece) {
  const { f, r } = squareIndex(sq)
  board[7 - r][f] = piece
}

function boardToFenPlacement(board) {
  return board
    .map((rank) => {
      let out = ""
      let empty = 0

      for (const cell of rank) {
        if (!cell) {
          empty += 1
        } else {
          if (empty) out += empty
          out += cell
          empty = 0
        }
      }

      if (empty) out += empty
      return out
    })
    .join("/")
}

function makeFen(wk, wq, bk, bp) {
  const board = emptyBoard()
  put(board, wk, "K")
  put(board, wq, "Q")
  put(board, bk, "k")
  put(board, bp, "p")
  return `${boardToFenPlacement(board)} w - - 0 1`
}

function blackKingNearPawn(bk, bp) {
  // Keep only positions where black king touches the pawn or is one square farther.
  // kingDistance 1 = touching, kingDistance 2 = one square away from touching.
  return kingDistance(bk, bp) <= 2
}

function isCandidateLegal(wk, wq, bk, bp) {
  const all = new Set([wk, wq, bk, bp])
  if (all.size !== 4) return false

  if (!blackKingNearPawn(bk, bp)) return false
  if (kingsAdjacent(wk, bk)) return false
  if (blackPawnAttacks(bp, wk)) return false

  const blockers = new Set([wk, bp])
  if (queenAttacksSquare(wq, bk, blockers)) return false

  try {
    const game = new Chess(makeFen(wk, wq, bk, bp))
    if (game.moves().length === 0) return false
    return true
  } catch {
    return false
  }
}

class Stockfish {
  constructor(enginePath) {
    this.proc = spawn(enginePath)
    this.waiters = []
    this.lines = []

    this.proc.stdout.on("data", (data) => {
      const text = data.toString()
      const lines = text.split(/\r?\n/).filter(Boolean)

      for (const line of lines) {
        this.lines.push(line)
        const waiter = this.waiters[0]
        if (waiter && line.includes(waiter.token)) {
          this.waiters.shift()
          waiter.resolve(this.lines.slice())
          this.lines = []
        }
      }
    })

    this.proc.stderr.on("data", (data) => {
      console.error("[stockfish]", data.toString())
    })
  }

  send(cmd) {
    this.proc.stdin.write(cmd + "\n")
  }

  waitFor(token) {
    return new Promise((resolve) => {
      this.waiters.push({ token, resolve })
    })
  }

  async init() {
    this.send("uci")
    await this.waitFor("uciok")
    this.send("isready")
    await this.waitFor("readyok")
  }

  async analyzeFen(fen, depth) {
    this.lines = []
    this.send("ucinewgame")
    this.send(`position fen ${fen}`)
    this.send(`go depth ${depth}`)

    const lines = await this.waitFor("bestmove")
    const infoLines = lines.filter((l) => l.startsWith("info "))
    const bestLine = lines.find((l) => l.startsWith("bestmove ")) || ""

    let bestMove = null
    const bestMatch = bestLine.match(/^bestmove\s+(\S+)/)
    if (bestMatch) bestMove = bestMatch[1]

    let lastScore = null

    for (const line of infoLines) {
      const cp = line.match(/\bscore cp (-?\d+)/)
      const mate = line.match(/\bscore mate (-?\d+)/)

      if (mate) {
        lastScore = { type: "mate", value: Number(mate[1]) }
      } else if (cp) {
        lastScore = { type: "cp", value: Number(cp[1]) }
      }
    }

    return { bestMove, score: lastScore }
  }

  close() {
    this.send("quit")
    this.proc.kill()
  }
}

function classifyFromScore(score) {
  if (!score) return "draw"
  if (score.type === "mate") return score.value > 0 ? "win" : "draw"
  if (score.type === "cp") return score.value >= 300 ? "win" : "draw"
  return "draw"
}

function scoreLabel(score) {
  if (!score) return "unknown"
  if (score.type === "mate") return `M${score.value}`
  return `${score.value}cp`
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildCandidates() {
  const squares = []
  for (const f of FILES) {
    for (const r of RANKS) {
      squares.push(square(f, r))
    }
  }

  const candidates = []

  for (const pawnFile of PAWN_FILES) {
    const bp = `${pawnFile}2`
    const theme = classifyTheme(pawnFile)

    for (const wk of squares) {
      for (const wq of squares) {
        for (const bk of squares) {
          if (!isCandidateLegal(wk, wq, bk, bp)) continue

          candidates.push({
            fen: makeFen(wk, wq, bk, bp),
            pawnFile,
            pawnSquare: bp,
            theme,
            label: `${theme} ${bp}`,
          })
        }
      }
    }
  }

  return shuffle(candidates)
}

function ensureDirs() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(CHUNKS_DIR, { recursive: true })
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

function splitChunks(items, prefix) {
  const files = []

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE)
    const fileName = `${prefix}_chunk_${files.length + 1}.json`
    writeJson(path.join(CHUNKS_DIR, fileName), chunk)
    files.push(fileName)
  }

  return files
}

function themeLabel(theme) {
  if (theme === "evaluation") return "Win or Draw?"
  if (theme === "rook-pawn") return "Rook pawn conversion"
  if (theme === "bishop-pawn") return "Bishop pawn conversion"
  if (theme === "knight-pawn") return "Knight pawn conversion"
  if (theme === "central-pawn") return "Central pawn conversion"
  return "Mixed conversion"
}

function enoughConversion(byTheme) {
  return (
    byTheme["rook-pawn"].length >= MAX_CONVERSION_PER_THEME["rook-pawn"] &&
    byTheme["bishop-pawn"].length >= MAX_CONVERSION_PER_THEME["bishop-pawn"] &&
    byTheme["knight-pawn"].length >= MAX_CONVERSION_PER_THEME["knight-pawn"] &&
    byTheme["central-pawn"].length >= MAX_CONVERSION_PER_THEME["central-pawn"] &&
    byTheme.mixed.length >= MAX_CONVERSION_PER_THEME.mixed
  )
}

async function main() {
  if (!fs.existsSync(STOCKFISH_PATH)) {
    console.error("Stockfish not found:")
    console.error(STOCKFISH_PATH)
    process.exit(1)
  }

  ensureDirs()

  console.log("Building legal near-pawn candidates...")
  const candidates = buildCandidates()
  console.log(`Candidates: ${candidates.length}`)

  const engine = new Stockfish(STOCKFISH_PATH)
  await engine.init()

  const evaluation = []
  const conversion = {
    "rook-pawn": [],
    "bishop-pawn": [],
    "knight-pawn": [],
    "central-pawn": [],
    mixed: [],
  }

  let checked = 0
  let wins = 0
  let draws = 0

  for (const c of candidates) {
    if (evaluation.length >= MAX_EVALUATION && enoughConversion(conversion)) break

    checked += 1
    if (checked % 25 === 0) {
      console.log(
        `Checked ${checked} | eval ${evaluation.length}/${MAX_EVALUATION} | wins ${wins} draws ${draws} | rook ${conversion["rook-pawn"].length}, bishop ${conversion["bishop-pawn"].length}, knight ${conversion["knight-pawn"].length}, central ${conversion["central-pawn"].length}, mixed ${conversion.mixed.length}`
      )
    }

    const analysis = await engine.analyzeFen(c.fen, DEPTH)
    const result = classifyFromScore(analysis.score)
    if (result === "win") wins += 1
    else draws += 1

    const baseItem = {
      id: `kqkp7_${c.theme}_${c.pawnSquare}_${checked}`,
      label: c.label,
      fen: c.fen,
      result,
      theme: c.theme,
      pawnFile: c.pawnFile,
      pawnSquare: c.pawnSquare,
      bestmove_uci: analysis.bestMove,
      engineScore: scoreLabel(analysis.score),
      explanation: explanationFor(c.theme, result, c.pawnSquare),
    }

    if (evaluation.length < MAX_EVALUATION) {
      evaluation.push({
        ...baseItem,
        id: `kqkp7_evaluation_${evaluation.length + 1}`,
        mode: "evaluate",
        theme: "evaluation",
        sourceTheme: c.theme,
      })
    }

    if (result === "win") {
      const themeLimit = MAX_CONVERSION_PER_THEME[c.theme]
      if (conversion[c.theme].length < themeLimit) {
        conversion[c.theme].push({
          ...baseItem,
          id: `kqkp7_${c.theme}_${conversion[c.theme].length + 1}`,
          mode: "convert",
        })
      }

      if (conversion.mixed.length < MAX_CONVERSION_PER_THEME.mixed) {
        conversion.mixed.push({
          ...baseItem,
          id: `kqkp7_mixed_${conversion.mixed.length + 1}`,
          theme: "mixed",
          mode: "convert",
        })
      }
    }
  }

  engine.close()

  const progression = {
    order: ["evaluation", "rook-pawn", "bishop-pawn", "knight-pawn", "central-pawn", "mixed"],
    masteryFastSolves: 5,
    maxSecondsPerMove: 3,
    themes: {},
  }

  const evaluationFiles = splitChunks(evaluation, "evaluation")
  progression.themes.evaluation = {
    label: themeLabel("evaluation"),
    mode: "evaluate",
    chunks: evaluationFiles,
    maxSecondsPerMove: 3,
  }

  for (const theme of ["rook-pawn", "bishop-pawn", "knight-pawn", "central-pawn", "mixed"]) {
    const files = splitChunks(conversion[theme], theme)
    progression.themes[theme] = {
      label: themeLabel(theme),
      mode: "convert",
      chunks: files,
      maxSecondsPerMove: 3,
    }
  }

  writeJson(path.join(OUT_DIR, "kqkp7_progression.json"), progression)

  console.log("")
  console.log("DONE")
  console.log(`Output: ${OUT_DIR}`)
  console.log(`evaluation: ${evaluation.length} positions, ${evaluationFiles.length} chunks`)
  for (const theme of ["rook-pawn", "bishop-pawn", "knight-pawn", "central-pawn", "mixed"]) {
    console.log(`${theme}: ${conversion[theme].length} winning positions, ${progression.themes[theme].chunks.length} chunks`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})