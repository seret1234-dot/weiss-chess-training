// build_anastasia_5010_chunks_easy_to_hard.cjs
//
// Streams lichess_db_puzzle.csv, finds Anastasia-style mate in 1 puzzles,
// sorts easy -> hard, takes up to 5010, splits into 30-puzzle chunks.
//
// Put lichess_db_puzzle.csv in the SAME folder as this script.
// Output goes to: ../../public/chunks/anastasia
//
// Run:
//   node scripts\good_converting_scripts\build_anastasia_5010_chunks_easy_to_hard.cjs

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { Chess } = require('chess.js')

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

function squareFile(square) {
  return square.charCodeAt(0) - 97
}

function squareRank(square) {
  return Number(square[1]) - 1
}

function isEdge(square) {
  const f = squareFile(square)
  const r = squareRank(square)
  return f === 0 || f === 7 || r === 0 || r === 7
}

function kingNeighbors(square) {
  const f = squareFile(square)
  const r = squareRank(square)
  const out = []

  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue
      const nf = f + df
      const nr = r + dr
      if (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
        out.push(String.fromCharCode(97 + nf) + String(nr + 1))
      }
    }
  }

  return out
}

function manhattan(a, b) {
  return Math.abs(squareFile(a) - squareFile(b)) + Math.abs(squareRank(a) - squareRank(b))
}

function chebyshev(a, b) {
  return Math.max(
    Math.abs(squareFile(a) - squareFile(b)),
    Math.abs(squareRank(a) - squareRank(b))
  )
}

function getPieceSquares(board, color, type) {
  const out = []
  for (const sq of Chess.SQUARES) {
    const p = board.get(sq)
    if (p && p.color === color && p.type === type) out.push(sq)
  }
  return out
}

function getSinglePieceSquare(board, color, type) {
  const arr = getPieceSquares(board, color, type)
  return arr.length ? arr[0] : null
}

function attacksSquare(board, from, to) {
  const moves = board.moves({ square: from, verbose: true })
  return moves.some(m => m.to === to)
}

function isRookMove(boardBefore, moveUci) {
  const from = moveUci.slice(0, 2)
  const piece = boardBefore.get(from)
  return !!(piece && piece.color === 'w' && piece.type === 'r')
}

function legalBlackKingMovesFromMatedPosition(boardAfterMate, blackKingSquare) {
  const moves = boardAfterMate.moves({ square: blackKingSquare, verbose: true })
  return moves.filter(m => m.piece === 'k')
}

function isAnastasiaGeometry(boardBefore, boardAfter, finalMoveUci) {
  if (!isRookMove(boardBefore, finalMoveUci)) return false
  if (!boardAfter.isCheckmate()) return false

  const bk = getSinglePieceSquare(boardAfter, 'b', 'k')
  const wk = getSinglePieceSquare(boardAfter, 'w', 'k')
  const wn = getSinglePieceSquare(boardAfter, 'w', 'n')

  if (!bk || !wk || !wn) return false
  if (!isEdge(bk)) return false

  const moveTo = finalMoveUci.slice(2, 4)
  const rook = boardAfter.get(moveTo)
  if (!rook || rook.color !== 'w' || rook.type !== 'r') return false

  const rookAligned =
    squareFile(moveTo) === squareFile(bk) ||
    squareRank(moveTo) === squareRank(bk)

  if (!rookAligned) return false

  const knightClose = chebyshev(wn, bk) <= 3 || manhattan(wn, bk) <= 4
  if (!knightClose) return false

  const neighbors = kingNeighbors(bk)
  const knightControlsNeighbor = neighbors.some(sq => attacksSquare(boardAfter, wn, sq))
  if (!knightControlsNeighbor) return false

  const kingCloseEnough = chebyshev(wk, bk) <= 4
  if (!kingCloseEnough) return false

  const blackKingLegalMoves = legalBlackKingMovesFromMatedPosition(boardAfter, bk)
  if (blackKingLegalMoves.length !== 0) return false

  const bkFile = squareFile(bk)
  const bkRank = squareRank(bk)
  const onSideFile = bkFile === 0 || bkFile === 7
  const onBackRank = bkRank === 0 || bkRank === 7

  if (onBackRank && !onSideFile) {
    if (chebyshev(wn, bk) > 2) return false
  }

  return true
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
  const seenFens = new Set()

  await streamCsvRows(CSV_PATH, async (row) => {
    const moves = splitMoves(row.Moves)
    if (moves.length !== 1) return

    const fen = row.FEN
    if (!fen) return

    let boardBefore
    try {
      boardBefore = new Chess(fen)
    } catch {
      return
    }

    if (boardBefore.turn() !== 'w') return

    const firstMove = moves[0]

    let boardAfter
    try {
      boardAfter = new Chess(fen)
      const moveObj = {
        from: firstMove.slice(0, 2),
        to: firstMove.slice(2, 4),
      }
      if (firstMove.length === 5) moveObj.promotion = firstMove[4]
      const applied = boardAfter.move(moveObj)
      if (!applied) return
    } catch {
      return
    }

    if (!boardAfter.isCheckmate()) return
    if (!isAnastasiaGeometry(boardBefore, boardAfter, firstMove)) return

    const finalFenKey = boardAfter.fen().split(' ').slice(0, 4).join(' ')
    if (seenFens.has(finalFenKey)) return
    seenFens.add(finalFenKey)

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