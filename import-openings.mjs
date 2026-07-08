import 'dotenv/config'
import fs from 'fs'
import { Chess } from 'chess.js'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const FILE_PATHS = ['./a.tsv', './b.tsv', './c.tsv', './d.tsv', './e.tsv']

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function pgnToMovesAndEpd(pgn) {
  const chess = new Chess()

  const sanMoves = pgn
    .replace(/\d+\.(\.\.)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

  const uciMoves = []

  for (const san of sanMoves) {
    const move = chess.move(san, { sloppy: true })
    if (!move) {
      throw new Error(`Could not parse SAN move: ${san}`)
    }
    uciMoves.push(move.from + move.to + (move.promotion || ''))
  }

  const epd = chess.fen().split(' ').slice(0, 4).join(' ')
  return { sanMoves, uciMoves, epd }
}

async function run() {
  let inserted = 0
  let skipped = 0
  let failed = 0

  const lines = FILE_PATHS.flatMap((filePath) => {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      process.exit(1)
    }

    return fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  })

  console.log(`Loaded ${lines.length} raw lines from ${FILE_PATHS.join(', ')}`)

  for (const row of lines) {
    const parts = row.split('\t')

    if (parts.length < 3) {
      skipped++
      continue
    }

    const [eco, name, pgn] = parts

    if (!eco || !name || !pgn || eco === 'eco') {
      skipped++
      continue
    }

    if (
      name.includes('<') ||
      name.includes('payload') ||
      name.includes('repositories') ||
      name.includes('featureFlags')
    ) {
      skipped++
      continue
    }

    try {
      const { sanMoves, uciMoves, epd } = pgnToMovesAndEpd(pgn)

      const family = name.includes(':') ? name.split(':')[0].trim() : name.trim()
      const variation = name.includes(':') ? name.split(':').slice(1).join(':').trim() : null

      const payload = {
        eco,
        name,
        slug: slugify(`${name}-${uciMoves.join('-')}`),
        family,
        variation,
        subvariation: null,
        san_moves: sanMoves,
        uci_moves: uciMoves,
        ply_count: uciMoves.length,
        final_epd: epd,
      }

      const { error } = await supabase
        .from('opening_lines')
        .upsert(payload, { onConflict: 'slug' })

      if (error) {
        failed++
        console.log(`Failed: ${name}`)
        console.log(error.message)
      } else {
        inserted++
        if (inserted % 200 === 0) {
          console.log(`Inserted: ${inserted}`)
        }
      }
    } catch (err) {
      failed++
      console.log(`Failed to parse: ${name}`)
      console.log(err.message)
    }
  }

  console.log(`Done. Inserted: ${inserted}, Skipped: ${skipped}, Failed: ${failed}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})