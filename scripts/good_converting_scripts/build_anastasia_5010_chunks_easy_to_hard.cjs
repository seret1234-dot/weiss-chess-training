// build_anastasia_5010_chunks_easy_to_hard.cjs
//
// Uses Lichess theme tags:
// - anastasiaMate
// - mateIn1
// - oneMove
//
// Put lichess_db_puzzle.csv in the SAME folder as this script.
// Output: public/chunks/anastasia
//
// Run:
// node scripts\good_converting_scripts\build_anastasia_5010_chunks_easy_to_hard.cjs

const fs = require('fs')
const path = require('path')
const readline = require('readline')

const CSV_PATH = path.join(__dirname, 'lichess_db_puzzle.csv')
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'public', 'chunks', 'anastasia')

const MAX_PUZZLES = 5010
const CHUNK_SIZE = 30

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function cleanOutputDir(dir) {
  ensureDir(dir)
  for (const file of fs.readdirSync(dir)) {
    if (/^chunk_\d+\.json$/i.test(file)) {
      fs.unlinkSync(path.join(dir, file))
    }
  }
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }

  out.push(cur)
  return out
}

function splitMoves(movesStr) {
  if (!movesStr) return []
  return movesStr.trim().split(/\s+/).filter(Boolean)
}

function hasRequiredThemes(themesStr) {
  if (!themesStr) return false
  const tags = new Set(themesStr.trim().split(/\s+/))

  return (
    tags.has('anastasiaMate') &&
    tags.has('mateIn1') &&
    tags.has('oneMove')
  )
}

function buildPuzzleRecord(row, idxInChunk, chunkNumber) {
  const moves = splitMoves(row.Moves)
  const firstMove = moves[0]

  return {
    id: `anastasia_chunk_${chunkNumber}_puzzle_${idxInChunk}`,
    lichessId: row.PuzzleId,
    fen: row.FEN,
    moves: firstMove ? [firstMove] : [],
    solution: firstMove ? [firstMove] : [],
    rating: Number(row.Rating || 0),
    ratingDeviation: Number(row.RatingDeviation || 0),
    popularity: Number(row.Popularity || 0),
    nbPlays: Number(row.NbPlays || 0),
    themes: row.Themes ? row.Themes.split(' ') : [],
    openingTags: row.OpeningTags ? row.OpeningTags.split(' ') : [],
    gameUrl: row.GameUrl || '',
    category: 'mates',
    theme: 'mate_in_1',
    subtheme: 'anastasia',
    mateIn: 1,
    chunk: chunkNumber,
    orderInChunk: idxInChunk,
  }
}

async function streamCsvRows(filePath, onRow) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' })
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  })

  let header = null
  let rowCount = 0

  for await (const line of rl) {
    if (!line.trim()) continue

    if (!header) {
      header = parseCsvLine(line)
      continue
    }

    const cols = parseCsvLine(line)
    if (cols.length !== header.length) continue

    const row = {}
    for (let i = 0; i < header.length; i++) {
      row[header[i]] = cols[i]
    }

    rowCount++
    if (rowCount % 100000 === 0) {
      console.log(`[SCAN] ${rowCount} rows...`)
    }

    await onRow(row, rowCount)
  }
}

async function main() {
  console.log('[LOAD] streaming csv...')

  const accepted = []
  const seenPuzzleIds = new Set()

  await streamCsvRows(CSV_PATH, async (row) => {
    if (!hasRequiredThemes(row.Themes)) return

    const puzzleId = row.PuzzleId
    if (!puzzleId || seenPuzzleIds.has(puzzleId)) return
    seenPuzzleIds.add(puzzleId)

    const moves = splitMoves(row.Moves)
    if (moves.length < 1) return

    accepted.push({
      row,
      rating: Number(row.Rating || 0),
    })
  })

  console.log(`[FILTER] anastasia mate-in-1 accepted: ${accepted.length}`)

  accepted.sort((a, b) => {
    if (a.rating !== b.rating) return a.rating - b.rating
    return String(a.row.PuzzleId).localeCompare(String(b.row.PuzzleId))
  })

  const finalList = accepted.slice(0, MAX_PUZZLES)
  console.log(`[FINAL] taking: ${finalList.length}`)

  cleanOutputDir(OUTPUT_DIR)

  const chunkCount = Math.ceil(finalList.length / CHUNK_SIZE)

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, finalList.length)
    const slice = finalList.slice(start, end)

    const chunkNumber = chunkIndex + 1
    const chunkData = slice.map((item, i) =>
      buildPuzzleRecord(item.row, i + 1, chunkNumber)
    )

    const outPath = path.join(
      OUTPUT_DIR,
      `chunk_${String(chunkNumber).padStart(3, '0')}.json`
    )

    fs.writeFileSync(outPath, JSON.stringify(chunkData, null, 2), 'utf8')
  }

  console.log(`[DONE] wrote ${chunkCount} chunks to ${OUTPUT_DIR}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})