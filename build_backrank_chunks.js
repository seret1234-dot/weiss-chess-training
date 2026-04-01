const fs = require('fs')
const path = require('path')
const readline = require('readline')

/*
  build_lichess_mate1_backrank_chunks.js

  What it does:
  - Streams the huge Lichess CSV (safe for very large files)
  - Filters only puzzles with:
      mateIn1
      backRankMate
  - Takes the first 60 valid puzzles
  - Splits them into 2 chunk files of 30
  - Outputs ready-to-use JSON

  Usage:
    node build_lichess_mate1_backrank_chunks.js

  Edit these paths if needed:
*/
const INPUT_CSV = path.join(__dirname, 'lichess_db_puzzle.csv')
const OUTPUT_DIR = path.join(__dirname, 'data', 'lichess', 'mate_in_1', 'back_rank')

const TARGET_TOTAL = 60
const CHUNK_SIZE = 30

function parseCsvLine(line) {
  const out = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }

  out.push(current)
  return out
}

function getRowObject(headers, values) {
  const obj = {}
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = values[i] ?? ''
  }
  return obj
}

function hasTheme(themesString, theme) {
  if (!themesString) return false
  const parts = themesString.trim().split(/\s+/)
  return parts.includes(theme)
}

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

async function main() {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`CSV file not found: ${INPUT_CSV}`)
    process.exit(1)
  }

  ensureDir(OUTPUT_DIR)

  const stream = fs.createReadStream(INPUT_CSV, { encoding: 'utf8' })
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  })

  let headers = null
  const selected = []
  let lineCount = 0

  for await (const line of rl) {
    lineCount++

    if (!line.trim()) continue

    if (!headers) {
      headers = parseCsvLine(line)
      continue
    }

    const values = parseCsvLine(line)

    if (values.length < headers.length) {
      continue
    }

    const row = getRowObject(headers, values)

    const puzzleId = row.PuzzleId || row.id || ''
    const fen = row.FEN || row.fen || ''
    const movesRaw = row.Moves || row.moves || ''
    const themesRaw = row.Themes || row.themes || ''
    const rating = safeNumber(row.Rating || row.rating, 0)
    const gameUrl = row.GameUrl || row.gameUrl || ''
    const openingTags = row.OpeningTags || row.openingTags || ''

    if (!puzzleId || !fen || !movesRaw || !themesRaw) {
      continue
    }

    if (!hasTheme(themesRaw, 'mateIn1')) continue
    if (!hasTheme(themesRaw, 'backRankMate')) continue

    const moveList = movesRaw.trim().split(/\s+/).filter(Boolean)
    if (moveList.length < 1) continue

    const record = {
      lichessId: puzzleId,
      fen,
      moves: moveList,              // full line from Lichess
      solution: moveList[0],        // for mate in 1, first move is enough
      theme: 'mate_in_1',
      subtheme: 'back_rank',
      rating,
      themes: themesRaw.trim().split(/\s+/),
      gameUrl,
      openingTags: openingTags ? openingTags.trim().split(/\s+/) : [],
      source: 'lichess',
    }

    selected.push(record)

    if (selected.length >= TARGET_TOTAL) {
      break
    }

    if (lineCount % 100000 === 0) {
      console.log(`Scanned ${lineCount.toLocaleString()} lines... found ${selected.length}`)
    }
  }

  if (selected.length === 0) {
    console.error('No matching mateIn1 + backRankMate puzzles found.')
    process.exit(1)
  }

  const chunks = chunkArray(selected, CHUNK_SIZE)

  for (let i = 0; i < chunks.length; i++) {
    const chunkNumber = i + 1
    const chunkData = chunks[i].map((puzzle, indexInChunk) => ({
      ...puzzle,
      localId: `${puzzle.subtheme}_chunk_${chunkNumber}_puzzle_${indexInChunk + 1}`,
      chunk: chunkNumber,
      chunkIndex: indexInChunk,
    }))

    const filename = `chunk_${String(chunkNumber).padStart(2, '0')}.json`
    const filepath = path.join(OUTPUT_DIR, filename)

    fs.writeFileSync(filepath, JSON.stringify(chunkData, null, 2), 'utf8')
    console.log(`Wrote ${filepath} (${chunkData.length} puzzles)`)
  }

  const manifest = {
    theme: 'mate_in_1',
    subtheme: 'back_rank',
    totalPuzzles: selected.length,
    chunkSize: CHUNK_SIZE,
    totalChunks: chunks.length,
    files: chunks.map((_, i) => `chunk_${String(i + 1).padStart(2, '0')}.json`),
    note: 'Lichess CSV does not include the previous move animation directly. This output uses the puzzle start FEN and the solution line.',
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  )

  console.log('\nDone.')
  console.log(`Total selected: ${selected.length}`)
  console.log(`Output folder: ${OUTPUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})