const fs = require("fs")
const path = require("path")
const readline = require("readline")

const root = process.cwd()
const csvCandidates = [
 path.join(root, "theme_exports", "mates", "mateIn2.csv"),
 path.join(root, "lichess_db_puzzle.csv"),
 path.join(root, "scripts", "good_converting_scripts", "lichess_db_puzzle.csv"),
]

const csvPath = csvCandidates.find((p) => fs.existsSync(p))
if (!csvPath) {
 throw new Error("Could not find a Lichess puzzle CSV")
}

const outDir = path.join(
 root,
 "public",
 "data",
 "pattern-mates",
 "arabian",
 "mate-in-2",
)

const chunkSize = 30
const maxPuzzles = 1500
const mateDistance = 2
const solutionMoveCount = mateDistance * 2 - 1
const puzzles = []

console.log("Using CSV:", csvPath)

const rl = readline.createInterface({
 input: fs.createReadStream(csvPath),
 crlfDelay: Infinity,
})

let isHeader = true

rl.on("line", (line) => {
 if (!line.trim()) return

 if (isHeader) {
 isHeader = false
 return
 }

 const cols = line.split(",")
 if (cols.length < 9) return

 const [
 PuzzleId,
 FEN,
 Moves,
 Rating,
 RatingDeviation,
 Popularity,
 NbPlays,
 Themes,
 GameUrl,
 OpeningTags,
 ] = cols

 const themes = String(Themes || "")
 .trim()
 .split(/\s+/)
 .filter(Boolean)

 if (!themes.includes("arabianMate")) return
 if (!themes.includes("mateIn2")) return

 const moveTokens = String(Moves || "")
 .trim()
 .split(/\s+/)
 .filter(Boolean)

 // Lichess format: preMove + solution line.
 // Mate in 2 needs 1 preMove + 3 solution moves.
 if (moveTokens.length < 1 + solutionMoveCount) return

 puzzles.push({
 id: PuzzleId,
 fen: FEN,
 moves: moveTokens,
 rating: Number.parseInt(Rating, 10) || 0,
 themes,
 gameUrl: GameUrl || "",
 openingTags: String(OpeningTags || "")
 .trim()
 .split(/\s+/)
 .filter(Boolean),
 })
})

rl.on("close", () => {
 puzzles.sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id))
 puzzles.splice(maxPuzzles)

 fs.rmSync(outDir, { recursive: true, force: true })
 fs.mkdirSync(outDir, { recursive: true })

 const files = []

 for (let i = 0; i < puzzles.length; i += chunkSize) {
 const chunkIndex = Math.floor(i / chunkSize)
 const chunkNumber = chunkIndex + 1
 const fileName = `chunk_${chunkIndex}.json`
 const slice = puzzles.slice(i, i + chunkSize)

 const chunkPuzzles = slice.map((puzzle, indexInChunk) => {
 const globalIndex = i + indexInChunk + 1

 return {
 id: puzzle.id,
 fen: puzzle.fen,
 preMove: puzzle.moves[0],
 rating: puzzle.rating,
 label: `Arabian Pattern ${globalIndex}`,
 theme: "Arabian Mate",
 chunkNumber,
 chunkIndex: indexInChunk,
 solutionLine: puzzle.moves.slice(1, 1 + solutionMoveCount),
 userMoveIndexes: [0, 2],

 lichessId: puzzle.id,
 themes: puzzle.themes,
 gameUrl: puzzle.gameUrl,
 openingTags: puzzle.openingTags,
 source: "lichess",
 localId: `arabian_mate_2_chunk_${String(chunkNumber).padStart(3, "0")}_puzzle_${indexInChunk + 1}`,
 positionInChunk: indexInChunk + 1,
 }
 })

 fs.writeFileSync(
 path.join(outDir, fileName),
 JSON.stringify({ puzzles: chunkPuzzles }, null, 2),
 "utf8",
 )

 files.push(fileName)
 }

 const ratings = puzzles.map((p) => p.rating).filter((n) => Number.isFinite(n))

 const manifest = {
 category: "Mate in 2",
 theme: "Arabian",
 totalChunks: files.length,
 chunkSize,
 totalPuzzles: puzzles.length,
 ratingRange: {
 min: ratings.length ? Math.min(...ratings) : null,
 max: ratings.length ? Math.max(...ratings) : null,
 },
 distribution: "easy_to_hard_by_rating",
 files,
 }

 fs.writeFileSync(
 path.join(outDir, "manifest.json"),
 JSON.stringify(manifest, null, 2),
 "utf8",
 )

 console.log("Created:", outDir)
 console.log("Puzzles:", puzzles.length)
 console.log("Chunks:", files.length)
 console.log("Rating:", manifest.ratingRange.min, "-", manifest.ratingRange.max)
})