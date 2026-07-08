const fs = require("fs")
const path = require("path")
const readline = require("readline")

const root = process.cwd()
const outDir = path.join(root, "public", "data", "pattern-mates", "boden", "mate-in-3")

const chunkSize = 30
const maxPuzzles = 1500
const wantedDistances = [3, 4]
const puzzles = []

function csvPathForMate(mateDistance) {
 const candidates = [
 path.join(root, "theme_exports", "mates", `mateIn${mateDistance}.csv`),
 path.join(root, "lichess_db_puzzle.csv"),
 path.join(root, "scripts", "good_converting_scripts", "lichess_db_puzzle.csv"),
 ]
 return candidates.find((p) => fs.existsSync(p))
}

async function scanMateDistance(mateDistance) {
 const csvPath = csvPathForMate(mateDistance)
 if (!csvPath) throw new Error(`Could not find CSV for mate in ${mateDistance}`)

 const solutionMoveCount = mateDistance * 2 - 1

 console.log("Using CSV:", csvPath)

 const rl = readline.createInterface({
 input: fs.createReadStream(csvPath),
 crlfDelay: Infinity,
 })

 let isHeader = true

 for await (const line of rl) {
 if (!line.trim()) continue

 if (isHeader) {
 isHeader = false
 continue
 }

 const cols = line.split(",")
 if (cols.length < 9) continue

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

 if (!themes.includes("bodenMate")) continue
 if (!themes.includes(`mateIn${mateDistance}`)) continue

 const moveTokens = String(Moves || "")
 .trim()
 .split(/\s+/)
 .filter(Boolean)

 if (moveTokens.length < 1 + solutionMoveCount) continue

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
 mateDistance,
 solutionMoveCount,
 })
 }
}

;(async () => {
 for (const mateDistance of wantedDistances) {
 await scanMateDistance(mateDistance)
 }

 puzzles.sort(
 (a, b) =>
 a.mateDistance - b.mateDistance ||
 a.rating - b.rating ||
 a.id.localeCompare(b.id)
 )

 const seen = new Set()
 const uniquePuzzles = []

 for (const puzzle of puzzles) {
 if (seen.has(puzzle.fen)) continue
 seen.add(puzzle.fen)
 uniquePuzzles.push(puzzle)
 }

 const finalPuzzles = uniquePuzzles.slice(0, maxPuzzles)

 fs.rmSync(outDir, { recursive: true, force: true })
 fs.mkdirSync(outDir, { recursive: true })

 const files = []

 for (let i = 0; i < finalPuzzles.length; i += chunkSize) {
 const chunkIndex = Math.floor(i / chunkSize)
 const chunkNumber = chunkIndex + 1
 const fileName = `chunk_${chunkIndex}.json`
 const slice = finalPuzzles.slice(i, i + chunkSize)

 const chunkPuzzles = slice.map((puzzle, indexInChunk) => {
 const globalIndex = i + indexInChunk + 1
 const isBonus = puzzle.mateDistance === 4

 return {
 id: puzzle.id,
 fen: puzzle.fen,
 preMove: puzzle.moves[0],
 rating: puzzle.rating,
 label: isBonus
 ? `Boden Mate in 4 Bonus ${globalIndex}`
 : `Boden Pattern ${globalIndex}`,
 theme: "Boden Mate",
 chunkNumber,
 chunkIndex: indexInChunk,
 solutionLine: puzzle.moves.slice(1, 1 + puzzle.solutionMoveCount),
 userMoveIndexes: Array.from({ length: puzzle.mateDistance }, (_, n) => n * 2),

 lichessId: puzzle.id,
 themes: puzzle.themes,
 gameUrl: puzzle.gameUrl,
 openingTags: puzzle.openingTags,
 source: "lichess",
 mateDistance: puzzle.mateDistance,
 bonusFromMateIn4: isBonus,
 localId: `boden_mate_${puzzle.mateDistance}_inside_m3_chunk_${String(chunkNumber).padStart(3, "0")}_puzzle_${indexInChunk + 1}`,
 positionInChunk: indexInChunk + 1,
 }
 })

 fs.writeFileSync(
 path.join(outDir, fileName),
 JSON.stringify({ puzzles: chunkPuzzles }, null, 2),
 "utf8"
 )

 files.push(fileName)
 }

 const ratings = finalPuzzles.map((p) => p.rating).filter((n) => Number.isFinite(n))
 const m3Count = finalPuzzles.filter((p) => p.mateDistance === 3).length
 const m4Count = finalPuzzles.filter((p) => p.mateDistance === 4).length

 const manifest = {
 category: "Mate in 3+",
 theme: "Boden",
 totalChunks: files.length,
 chunkSize,
 totalPuzzles: finalPuzzles.length,
 includedMateDistances: [3, 4],
 countsByMateDistance: {
 mateIn3: m3Count,
 mateIn4Bonus: m4Count,
 },
 ratingRange: {
 min: ratings.length ? Math.min(...ratings) : null,
 max: ratings.length ? Math.max(...ratings) : null,
 },
 distribution: "mate_in_3_then_mate_in_4_bonus_unique_fen",
 files,
 }

 fs.writeFileSync(
 path.join(outDir, "manifest.json"),
 JSON.stringify(manifest, null, 2),
 "utf8"
 )

 console.log("Created:", outDir)
 console.log("Total puzzles:", finalPuzzles.length)
 console.log("Mate in 3:", m3Count)
 console.log("Mate in 4 bonus:", m4Count)
 console.log("Chunks:", files.length)
 console.log("Rating:", manifest.ratingRange.min, "-", manifest.ratingRange.max)
})()