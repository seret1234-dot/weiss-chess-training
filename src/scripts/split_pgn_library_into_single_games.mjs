import fs from 'fs'
import path from 'path'
import process from 'process'

const ROOT = process.cwd()
const SOURCE_DIR = path.join(ROOT, 'pgn_import')
const OUTPUT_DIR = path.join(ROOT, 'pgn_rebuild', 'split_games')

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function normalizeNewlines(text) {
  return String(text || '').replace(/\r\n/g, '\n')
}

function parseHeaders(pgnText) {
  const headers = {}
  const lines = normalizeNewlines(pgnText).split('\n')

  for (const line of lines) {
    const match = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/)
    if (!match) break
    headers[match[1]] = match[2]
  }

  return headers
}

function splitMultiGamePgn(content) {
  const text = normalizeNewlines(content).trim()
  if (!text) return []

  const lines = text.split('\n')
  const games = []
  let current = []

  for (const line of lines) {
    const isNewGameHeader = line.startsWith('[Event ')

    if (isNewGameHeader && current.length > 0) {
      const gameText = current.join('\n').trim()
      if (gameText) games.push(gameText)
      current = []
    }

    current.push(line)
  }

  if (current.length > 0) {
    const gameText = current.join('\n').trim()
    if (gameText) games.push(gameText)
  }

  return games
}

function inferYear(headers) {
  const date = headers.Date || ''
  const m = String(date).match(/^(\d{4})/)
  if (m) return m[1]
  return 'unknown'
}

function makeGameFileName(headers, index) {
  const white = slugify(headers.White || 'white')
  const black = slugify(headers.Black || 'black')
  const year = inferYear(headers)
  return `${String(index).padStart(5, '0')}_${white}_vs_${black}_${year}.pgn`
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Missing source dir: ${SOURCE_DIR}`)
    process.exit(1)
  }

  ensureDir(OUTPUT_DIR)

  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((name) => name.toLowerCase().endsWith('.pgn'))

  if (files.length === 0) {
    console.log(`No .pgn files found in ${SOURCE_DIR}`)
    return
  }

  let totalFiles = 0
  let totalGames = 0

  for (const fileName of files) {
    totalFiles++

    const sourcePath = path.join(SOURCE_DIR, fileName)
    const content = fs.readFileSync(sourcePath, 'utf8')
    const games = splitMultiGamePgn(content)

    const folderName = path.parse(fileName).name
    const outDir = path.join(OUTPUT_DIR, folderName)

    ensureDir(outDir)

    let count = 0

    for (let i = 0; i < games.length; i++) {
      const gameText = games[i]
      const headers = parseHeaders(gameText)
      const outName = makeGameFileName(headers, i + 1)

      const outPath = path.join(outDir, outName)
      fs.writeFileSync(outPath, gameText + '\n', 'utf8')

      count++
      totalGames++
    }

    console.log(`${fileName} → ${count} games`)
  }

  console.log('\nDone.')
  console.log(`Files processed: ${totalFiles}`)
  console.log(`Total games created: ${totalGames}`)
  console.log(`Output: ${OUTPUT_DIR}`)
}

main()