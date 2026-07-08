import fs from "fs"
import path from "path"
import { spawn } from "child_process"
import { Chess } from "chess.js"

const STOCKFISH_PATH =
  "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe"

const OUTPUT_FILE = path.join(process.cwd(), "src", "kqkr_positions.json")

const TARGET_PER_GROUP = 90
const MAX_ATTEMPTS = 250000
const FILES = "abcdefgh"

const GROUPS = [
  { key: "fork-1", label: "Fork in 1", target: TARGET_PER_GROUP },
  { key: "fork-2", label: "Fork in 2", target: TARGET_PER_GROUP },
  { key: "fork-3", label: "Fork in 3", target: TARGET_PER_GROUP },
  { key: "second-rank-defense", label: "Second-rank defense", target: TARGET_PER_GROUP },
  { key: "third-rank-defense", label: "Third-rank defense", target: TARGET_PER_GROUP },
  { key: "rook-checking-defense", label: "Rook checking defense", target: TARGET_PER_GROUP },
  { key: "mixed-conversion", label: "Mixed conversion", target: TARGET_PER_GROUP },
]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function randomSquare() {
  return `${FILES[Math.floor(Math.random() * 8)]}${1 + Math.floor(Math.random() * 8)}`
}

function coords(square) {
  return { file: FILES.indexOf(square[0]), rank: Number(square[1]) }
}

function kingsTooClose(a, b) {
  const ca = coords(a)
  const cb = coords(b)
  return Math.max(Math.abs(ca.file - cb.file), Math.abs(ca.rank - cb.rank)) <= 1
}

function buildFen(wk, wq, bk, br) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null))

  for (const [sq, piece] of [
    [wk, "K"],
    [wq, "Q"],
    [bk, "k"],
    [br, "r"],
  ]) {
    const file = FILES.indexOf(sq[0])
    const rank = 8 - Number(sq[1])
    board[rank][file] = piece
  }

  const rows = board.map((row) => {
    let out = ""
    let empty = 0

    for (const p of row) {
      if (!p) empty++
      else {
        if (empty) out += empty
        empty = 0
        out += p
      }
    }

    if (empty) out += empty
    return out
  })

  return `${rows.join("/")} w - - 0 1`
}

function forceTurnFen(fen, turn) {
  const parts = fen.trim().split(/\s+/)
  parts[1] = turn
  if (parts.length === 4) parts.push("0", "1")
  if (parts.length === 5) parts.push("1")
  return parts.join(" ")
}

function getPieceSquare(chess, type, color) {
  const board = chess.board()

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f]
      if (p?.type === type && p.color === color) {
        return `${FILES[f]}${8 - r}`
      }
    }
  }

  return null
}

function hasBlackRook(chess) {
  return !!getPieceSquare(chess, "r", "b")
}

function whiteCanCaptureRookNow(chess) {
  return chess.moves({ verbose: true }).some(
    (m) => m.color === "w" && m.captured === "r"
  )
}

function blackCanCaptureQueenNow(chess) {
  const blackTurn = new Chess(forceTurnFen(chess.fen(), "b"))

  return blackTurn.moves({ verbose: true }).some(
    (m) => m.color === "b" && m.captured === "q"
  )
}

function makeRandomFen() {
  for (let i = 0; i < 500; i++) {
    const wk = randomSquare()
    const wq = randomSquare()
    const bk = randomSquare()
    const br = randomSquare()

    if (new Set([wk, wq, bk, br]).size !== 4) continue
    if (kingsTooClose(wk, bk)) continue

    const fen = buildFen(wk, wq, bk, br)

    try {
      const whiteTurn = new Chess(fen)
      if (whiteTurn.isCheck()) continue
      if (whiteTurn.isCheckmate()) continue
      if (whiteTurn.isStalemate()) continue
      if (whiteCanCaptureRookNow(whiteTurn)) continue
      if (blackCanCaptureQueenNow(whiteTurn)) continue

      const blackTurn = new Chess(forceTurnFen(fen, "b"))
      if (blackTurn.isCheck()) continue
      if (blackTurn.isCheckmate()) continue
      if (blackTurn.isStalemate()) continue

      return fen
    } catch {
      continue
    }
  }

  return null
}

function rookRank(fen) {
  const chess = new Chess(fen)
  const sq = getPieceSquare(chess, "r", "b")
  return sq ? Number(sq[1]) : null
}

function blackRookCanCheckWhiteKing(fen) {
  const chess = new Chess(forceTurnFen(fen, "b"))

  return chess.moves({ verbose: true }).some((m) => {
    const piece = chess.get(m.from)
    if (piece?.type !== "r") return false

    const test = new Chess(chess.fen())
    test.move(m)

    return test.isCheck()
  })
}

function applyMove(fen, uci) {
  if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null

  const chess = new Chess(fen)

  const move = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4] || "q",
  })

  return move ? chess : null
}

function saveOutput(groups) {
  const output = {
    groups: GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      positions: groups[g.key].slice(0, TARGET_PER_GROUP),
    })),
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8")
}

class Stockfish {
  constructor() {
    this.proc = spawn(STOCKFISH_PATH, [], { stdio: "pipe" })
    this.buffer = ""

    this.proc.stdout.on("data", (data) => {
      this.buffer += data.toString()
    })

    this.proc.stderr.on("data", (data) => {
      console.error("Stockfish stderr:", data.toString())
    })

    this.proc.on("error", (err) => {
      console.error("Failed to start Stockfish:", err)
    })
  }

  send(command) {
    this.proc.stdin.write(command + "\n")
  }

  async waitFor(token, timeoutMs = 20000) {
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      if (this.buffer.includes(token)) {
        const output = this.buffer
        this.buffer = ""
        return output
      }

      await sleep(20)
    }

    throw new Error(`Stockfish timeout waiting for ${token}`)
  }

  async init() {
    this.send("uci")
    await this.waitFor("uciok")

    this.send("isready")
    await this.waitFor("readyok")
  }

  async bestMove(fen, depth = 10) {
    this.buffer = ""

    this.send(`position fen ${fen}`)
    this.send(`go depth ${depth}`)

    const output = await this.waitFor("bestmove")
    const match = output.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/)

    return match ? match[1] : null
  }

  quit() {
    this.send("quit")
  }
}

async function computeDistance(engine, fen) {
  let currentFen = fen

  for (let ply = 1; ply <= 14; ply++) {
    const chess = new Chess(currentFen)

    if (!hasBlackRook(chess)) {
      return Math.ceil((ply - 1) / 2)
    }

    const best = await engine.bestMove(currentFen)
    if (!best) return null

    const next = applyMove(currentFen, best)
    if (!next) return null

    currentFen = next.fen()
  }

  return null
}

// True fork-in-1:
// White to move, no immediate rook capture,
// but White has a non-capture move after which Black cannot avoid losing rook next.
async function extractFork1(engine, fen) {
  const chess = new Chess(fen)
  const moves = chess.moves({ verbose: true })

  for (const move of moves) {
    if (move.captured === "r") continue

    const test = new Chess(chess.fen())
    test.move(move)

    if (!hasBlackRook(test)) continue

    const replies = test.moves({ verbose: true })

    for (const reply of replies) {
      const replyGame = new Chess(test.fen())
      replyGame.move(reply)

      const whiteMoves = replyGame.moves({ verbose: true })

      if (whiteMoves.some((wm) => wm.color === "w" && wm.captured === "r")) {
        return fen
      }
    }
  }

  return null
}

function classify(fen, distance, groups) {
  const rank = rookRank(fen)

  if (distance === 2) return "fork-2"
  if (distance === 3) return "fork-3"

  if (groups["mixed-conversion"].length < TARGET_PER_GROUP) {
    return "mixed-conversion"
  }

  if (rank === 2 || rank === 7) return "second-rank-defense"
  if (rank === 3 || rank === 6) return "third-rank-defense"

  if (blackRookCanCheckWhiteKing(fen)) return "rook-checking-defense"

  return "mixed-conversion"
}

function emptyGroups() {
  return Object.fromEntries(GROUPS.map((g) => [g.key, []]))
}

function loadExistingGroups() {
  const groups = emptyGroups()

  if (!fs.existsSync(OUTPUT_FILE)) return groups

  try {
    const raw = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"))

    for (const group of raw.groups ?? []) {
      if (!groups[group.key]) continue
      groups[group.key] = Array.isArray(group.positions)
        ? group.positions.slice(0, TARGET_PER_GROUP)
        : []
    }
  } catch {
    return groups
  }

  return groups
}

function buildSeenSet(groups) {
  const seen = new Set()

  for (const group of Object.values(groups)) {
    for (const item of group) {
      if (item?.fen) seen.add(item.fen)
    }
  }

  return seen
}

function isFull(groups) {
  return GROUPS.every((g) => groups[g.key].length >= g.target)
}

async function main() {
  const engine = new Stockfish()
  await engine.init()

  const groups = loadExistingGroups()
  const seen = buildSeenSet(groups)

  saveOutput(groups)

  console.log("Starting counts:")
  for (const group of GROUPS) {
    console.log(`${group.label}: ${groups[group.key].length}/${TARGET_PER_GROUP}`)
  }

  let attempts = 0

  while (attempts < MAX_ATTEMPTS && !isFull(groups)) {
    attempts++

    const fen = makeRandomFen()
    if (!fen || seen.has(fen)) continue

    let distance = null

    try {
      distance = await computeDistance(engine, fen)
    } catch {
      continue
    }

    if (!distance) continue

    const key = classify(fen, distance, groups)

    if (
      (key === "fork-2" || key === "fork-3") &&
      groups["fork-1"].length < TARGET_PER_GROUP
    ) {
      const fork1Fen = await extractFork1(engine, fen)

      if (fork1Fen && !seen.has(fork1Fen)) {
        groups["fork-1"].push({ fen: fork1Fen })
        seen.add(fork1Fen)
        saveOutput(groups)

        console.log(`fork-1: ${groups["fork-1"].length}/${TARGET_PER_GROUP}`)
      }
    }

    if (groups[key].length >= TARGET_PER_GROUP) continue

    groups[key].push({ fen })
    seen.add(fen)

    saveOutput(groups)

    console.log(
      `${key}: ${groups[key].length}/${TARGET_PER_GROUP} | distance ${distance} | attempts ${attempts}`
    )
  }

  engine.quit()
  saveOutput(groups)

  console.log("")
  console.log("Done.")
  console.log(`Output: ${OUTPUT_FILE}`)

  for (const group of GROUPS) {
    console.log(`${group.label}: ${groups[group.key].length}/${TARGET_PER_GROUP}`)
  }

  if (!isFull(groups)) {
    console.log("")
    console.log("Warning: some groups did not reach target before MAX_ATTEMPTS.")
  }
}

main().catch((err) => {
  console.error("Generator failed:")
  console.error(err)
  process.exit(1)
})