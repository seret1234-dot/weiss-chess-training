import fs from 'fs'
import path from 'path'
import process from 'process'

const ROOT = process.cwd()
const INPUT_DIR = path.join(ROOT, 'pgn_rebuild', 'split_games')
const OUTPUT_DIR = path.join(ROOT, 'pgn_rebuild', 'clean_games')

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function normalize(text) {
  return String(text || '').replace(/\r\n/g, '\n')
}

// only keep these headers
const ALLOWED_HEADERS = new Set([
  'White',
  'Black',
  'Result',
  'Date',
])

function cleanPgn(pgnText) {
  const lines = normalize(pgnText).split('\n')
  const cleaned = []

  let inHeader = true

  for (const line of lines) {
    const headerMatch = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/)

    if (headerMatch) {
      const key = headerMatch[1]

      if (ALLOWED_HEADERS.has(key)) {
        cleaned.push(line)
      }

      continue
    }

    // first non-header line → switch
    inHeader = false
    cleaned.push(line)
  }

  return cleaned.join('\n').trim() + '\n'
}

function processDir(inputDir, outputDir) {
  ensureDir(outputDir)

  const items = fs.readdirSync(inputDir)

  for (const item of items) {
    const inPath = path.join(inputDir, item)
    const outPath = path.join(outputDir, item)

    const stat = fs.statSync(inPath)

    if (stat.isDirectory()) {
      processDir(inPath, outPath)
      continue
    }

    if (!item.toLowerCase().endsWith('.pgn')) continue

    const content = fs.readFileSync(inPath, 'utf8')
    const cleaned = cleanPgn(content)

    fs.writeFileSync(outPath, cleaned, 'utf8')
  }
}

function main() {
  if (!fs.existsSync(INPUT_DIR)) {
    console.error('Missing input dir:', INPUT_DIR)
    process.exit(1)
  }

  processDir(INPUT_DIR, OUTPUT_DIR)

  console.log('Done.')
  console.log('Clean files in:', OUTPUT_DIR)
}

main()