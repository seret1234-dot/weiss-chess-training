import fs from "fs"
import path from "path"
import { Chess } from "chess.js"

const OUTPUT_DIR =
  "C:\\Users\\Ariel\\chess-trainer\\public\\data\\endgames\\knnkp"

const TOTAL_POSITIONS = 240
const CHUNK_SIZE = 30

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function makeFen({ wk, n1, n2, bk, bp }) {
  const board = new Chess()
  board.clear()

  try {
    board.put({ type: "k", color: "w" }, wk)
    board.put({ type: "n", color: "w" }, n1)
    board.put({ type: "n", color: "w" }, n2)
    board.put({ type: "k", color: "b" }, bk)
    board.put({ type: "p", color: "b" }, bp)

    const parts = board.fen().split(" ")
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

const templates = [
  {
    bk: ["a8", "b8", "a7"],
    wk: ["c6", "d6", "b6", "c5"],
    n: ["c7", "d7", "b6", "c5", "d5"],
    bp: ["a6", "b6", "c6", "h6", "g6"],
  },
  {
    bk: ["h8", "g8", "h7"],
    wk: ["f6", "e6", "g6", "f5"],
    n: ["f7", "e7", "g6", "f5", "e5"],
    bp: ["h6", "g6", "f6", "a6", "b6"],
  },
  {
    bk: ["a1", "b1", "a2"],
    wk: ["c3", "d3", "b3", "c4"],
    n: ["c2", "d2", "b3", "c4", "d4"],
    bp: ["a3", "b3", "c3", "h3", "g3"],
  },
  {
    bk: ["h1", "g1", "h2"],
    wk: ["f3", "e3", "g3", "f4"],
    n: ["f2", "e2", "g3", "f4", "e4"],
    bp: ["h3", "g3", "f3", "a3", "b3"],
  },
]

function generatePosition() {
  for (let i = 0; i < 200; i++) {
    const t = randomFrom(templates)

    const wk = randomFrom(t.wk)
    const bk = randomFrom(t.bk)
    const n1 = randomFrom(t.n)
    const n2 = randomFrom(t.n)
    const bp = randomFrom(t.bp)

    const all = [wk, bk, n1, n2, bp]
    if (new Set(all).size !== all.length) continue

    const fen = makeFen({ wk, n1, n2, bk, bp })
    if (fen) return fen
  }

  return null
}

const seen = new Set()
const positions = []
let attempts = 0
const maxAttempts = 50000

while (positions.length < TOTAL_POSITIONS && attempts < maxAttempts) {
  attempts++

  const fen = generatePosition()
  if (!fen) continue
  if (seen.has(fen)) continue

  seen.add(fen)

  positions.push({
    id: `knnkp_${String(positions.length + 1).padStart(4, "0")}`,
    label: `KNN vs KP #${positions.length + 1}`,
    fen,
    result: "win",
    theme: "practice",
    explanation:
      "Use the pawn as a tempo resource. Do not simplify into bare KNN vs K too early.",
  })

  if (positions.length % 20 === 0) {
    console.log(`Generated ${positions.length}/${TOTAL_POSITIONS}`)
  }
}

if (positions.length < TOTAL_POSITIONS) {
  console.log(`Only generated ${positions.length}/${TOTAL_POSITIONS}`)
}

fs.rmSync(path.join(OUTPUT_DIR, "chunks"), { recursive: true, force: true })
fs.mkdirSync(path.join(OUTPUT_DIR, "chunks"), { recursive: true })

const chunks = []
for (let i = 0; i < positions.length; i += CHUNK_SIZE) {
  chunks.push(positions.slice(i, i + CHUNK_SIZE))
}

chunks.forEach((chunk, index) => {
  const file = `chunk_${String(index + 1).padStart(3, "0")}.json`

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "chunks", file),
    JSON.stringify({ positions: chunk }, null, 2)
  )
})

fs.writeFileSync(
  path.join(OUTPUT_DIR, "progression.json"),
  JSON.stringify(
    {
      order: ["practice"],
      themes: {
        practice: {
          id: "practice",
          label: "KNN vs KP Practice",
          chunkFiles: chunks.map(
            (_, i) => `chunk_${String(i + 1).padStart(3, "0")}.json`
          ),
          masteryFastSolves: 5,
          maxSecondsPerMove: 3,
          goal: "convert",
          mode: "convert",
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

console.log("DONE")
console.log(`Output: ${OUTPUT_DIR}`)
console.log(`Positions: ${positions.length}`)
console.log(`Chunks: ${chunks.length}`)