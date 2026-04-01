const fs = require('fs')
const path = require('path')
const readline = require('readline')

const INPUT_CSV = path.join(__dirname, 'lichess_db_puzzle.csv')
const OUTPUT_DIR = path.join(
  __dirname,
  'public',
  'data',
  'lichess',
  'mate_in_1',
  'back_rank'
)

const TARGET_TOTAL = 5010
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
  return themesString.trim().split(/\s+/).includes(theme)
}

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeUci(uci) {
  return String(uci || '').trim().toLowerCase()
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function chunkArray(items, chunkSize) {
  const chunks = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
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
    if (values.length < headers.length) continue

    const row = getRowObject(headers, values)

    const puzzleId = row.PuzzleId || row.id || ''
    const fen = row.FEN || row.fen || ''
    const movesRaw = row.Moves || row.moves || ''
    const themesRaw = row.Themes || row.themes || ''
    const rating = safeNumber(row.Rating || row.rating, 0)
    const gameUrl = row.GameUrl || row.gameUrl || ''
    const openingTags = row.OpeningTags || row.openingTags || ''

    if (!puzzleId || !fen || !movesRaw || !themesRaw) continue
    if (!hasTheme(themesRaw, 'mateIn1')) continue
    if (!hasTheme(themesRaw, 'backRankMate')) continue

    const moveList = movesRaw
      .trim()
      .split(/\s+/)
      .map(normalizeUci)
      .filter(Boolean)

    // Needed by your trainer:
    // moves[0] = pre-move
    // moves[1] = actual mate-in-1 solution
    if (moveList.length < 2) continue

    selected.push({
      lichessId: puzzleId,
      fen,
      moves: moveList,
      preMove: moveList[0],
      solution: moveList[1],
      theme: 'mate_in_1',
      subtheme: 'back_rank',
      rating,
      themes: themesRaw.trim().split(/\s+/),
      gameUrl,
      openingTags: openingTags ? openingTags.trim().split(/\s+/) : [],
      source: 'lichess',
    })

    if (lineCount % 250000 === 0) {
      console.log(`Scanned ${lineCount.toLocaleString()} lines... found ${selected.length}`)
    }
  }

  if (selected.length < TARGET_TOTAL) {
    console.error(
      `Only found ${selected.length} matching mateIn1 + backRankMate puzzles, need ${TARGET_TOTAL}.`
    )
    process.exit(1)
  }

  // Easy to hard
  selected.sort((a, b) => a.rating - b.rating)

  // Keep exactly 5010
  const trimmed = selected.slice(0, TARGET_TOTAL)

  const chunks = chunkArray(trimmed, CHUNK_SIZE)

  if (chunks.length !== 167) {
    console.error(`Expected 167 chunks, got ${chunks.length}`)
    process.exit(1)
  }

  const badChunk = chunks.find((chunk) => chunk.length !== CHUNK_SIZE)
  if (badChunk) {
    console.error('At least one chunk does not have exactly 30 puzzles.')
    process.exit(1)
  }

  let globalMinRating = Infinity
  let globalMaxRating = -Infinity

  const chunkSummaries = []

  for (let i = 0; i < chunks.length; i++) {
    const chunkNumber = i + 1
    const chunk = chunks[i]

    const chunkRatings = chunk.map((p) => p.rating)
    const chunkMin = Math.min(...chunkRatings)
    const chunkMax = Math.max(...chunkRatings)

    globalMinRating = Math.min(globalMinRating, chunkMin)
    globalMaxRating = Math.max(globalMaxRating, chunkMax)

    const chunkData = chunk.map((puzzle, indexInChunk) => ({
      ...puzzle,
      localId: `back_rank_chunk_${chunkNumber}_puzzle_${indexInChunk + 1}`,
      chunk: chunkNumber,
      chunkIndex: indexInChunk,
      positionInChunk: indexInChunk + 1,
    }))

    const filename = `chunk_${String(chunkNumber).padStart(3, '0')}.json`
    const filepath = path.join(OUTPUT_DIR, filename)

    fs.writeFileSync(filepath, JSON.stringify(chunkData, null, 2), 'utf8')
    console.log(
      `Wrote ${filename} (${chunkData.length} puzzles, rating ${chunkMin}-${chunkMax})`
    )

    chunkSummaries.push({
      chunk: chunkNumber,
      file: filename,
      ratingMin: chunkMin,
      ratingMax: chunkMax,
      puzzleCount: chunkData.length,
    })
  }

  const manifest = {
    category: 'mates',
    theme: 'mate_in_1',
    subtheme: 'back_rank',
    totalPuzzles: TARGET_TOTAL,
    chunkSize: CHUNK_SIZE,
    totalChunks: chunks.length,
    ratingRange: {
      min: globalMinRating,
      max: globalMaxRating,
    },
    distribution: 'easy_to_hard_by_rating',
    files: chunks.map((_, i) => `chunk_${String(i + 1).padStart(3, '0')}.json`),
    chunkSummaries,
    note: 'moves[0] = preMove, moves[1] = solution',
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  )

  console.log('\nDone.')
  console.log(`Total puzzles: ${TARGET_TOTAL}`)
  console.log(`Total chunks: ${chunks.length}`)
  console.log(`Rating range: ${globalMinRating} - ${globalMaxRating}`)
  console.log(`Output folder: ${OUTPUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})