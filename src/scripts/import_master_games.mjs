import fs from 'fs'
import path from 'path'
import process from 'process'
import crypto from 'crypto'
import slugify from 'slugify'
import { createClient } from '@supabase/supabase-js'
import { parse } from '@mliebelt/pgn-parser'

const SUPABASE_URL = 'https://lahzgtcpbshmzsqoqswf.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const BUCKET = 'master-games-pgn'
const INPUT_DIR = process.argv[2] || './pgn_import'
const BATCH_SIZE = 100

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeSlug(value) {
  return slugify(String(value || 'game'), {
    lower: true,
    strict: true,
    trim: true,
  })
}

function extractHeaders(pgnText) {
  const headers = {}

  for (const line of pgnText.split(/\r?\n/)) {
    const m = line.match(/^\[(\w+)\s+"(.*)"\]$/)
    if (m) headers[m[1]] = m[2]
  }

  return headers
}

function splitPgnGames(fullText) {
  return fullText
    .replace(/\r\n/g, '\n')
    .split(/\n(?=\[Event\s+")/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

function countMovesFromPgn(pgnText) {
  try {
    const parsed = parse(pgnText, { startRule: 'games' })
    const game = Array.isArray(parsed) ? parsed[0] : parsed
    return game?.moves?.length || null
  } catch {
    return null
  }
}

function getYear(headers) {
  const raw = String(headers.Date || '').trim()
  const m = raw.match(/^(\d{4})/)
  return m ? Number(m[1]) : null
}

function getGameDate(headers) {
  const raw = String(headers.Date || '').trim()
  if (!raw || raw.includes('?')) return null
  return raw
}

function normalizeSite(value) {
  const raw = String(value || '').trim()
  if (!raw || raw === '?') return null
  return normalizeText(raw)
}

function normalizeEvent(value) {
  const raw = String(value || '').trim()
  if (!raw || raw === '?') return null
  return normalizeText(raw)
}

function shortHash(text) {
  return crypto
    .createHash('sha1')
    .update(text)
    .digest('hex')
    .slice(0, 12)
}

function buildBaseSlug(h) {
  return [
    safeSlug(h.White),
    safeSlug(h.Black),
    getYear(h) || 'x',
    safeSlug(h.Event),
    safeSlug(h.Round),
    safeSlug(String(h.Date || '').replace(/\./g, '-')),
    safeSlug(h.Result),
  ]
    .filter(Boolean)
    .join('-')
}

function buildStableSlug(headers, pgnText) {
  const base = buildBaseSlug(headers)
  const hash = shortHash(normalizeText(pgnText))
  return `${base || 'game'}-${hash}`
}

function buildTitle(white, black, year) {
  return `${white} vs ${black}${year ? `, ${year}` : ''}`
}

async function uploadPgn(storageKey, pgnText) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storageKey, pgnText, { upsert: true })

  if (error) throw error
}

async function upsertRows(rows) {
  if (!rows.length) return

  const { error } = await supabase
    .from('game_library')
    .upsert(rows, { onConflict: 'slug' })

  if (error) throw error
}

function getPgnFiles(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Input directory does not exist: ${dir}`)
  }

  return fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.pgn'))
    .map((f) => path.join(dir, f))
}

async function importFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const games = splitPgnGames(text)

  console.log(`\n${path.basename(filePath)}: found ${games.length} games`)

  let uploaded = 0
  let skipped = 0
  let failed = 0
  let batch = []
  let batchSlugs = new Set()

  for (let i = 0; i < games.length; i++) {
    try {
      const pgn = games[i]

      if (!pgn.trim()) {
        skipped++
        continue
      }

      const h = extractHeaders(pgn)

      const white = h.White || 'Unknown'
      const black = h.Black || 'Unknown'
      const year = getYear(h)
      const gameDate = getGameDate(h)
      const slug = buildStableSlug(h, pgn)
      const key = `games/${slug}.pgn`

      if (batchSlugs.has(slug)) {
        skipped++
        continue
      }

      console.log(`Uploading ${i + 1}/${games.length}`)

      await uploadPgn(key, pgn)

      const title = buildTitle(white, black, year)
      const event = h.Event || null
      const site = h.Site || null

      const row = {
        slug,
        title,
        white,
        black,
        white_norm: normalizeText(white),
        black_norm: normalizeText(black),
        year,
        game_date: gameDate,
        event,
        event_norm: normalizeEvent(event),
        site,
        site_norm: normalizeSite(site),
        round: h.Round || null,
        result: h.Result || null,
        eco: h.ECO || null,
        opening: h.Opening || null,
        move_count: countMovesFromPgn(pgn),
        pgn_storage_key: key,
        search_text: normalizeText([
          white,
          black,
          event || '',
          site || '',
          h.Round || '',
          h.Result || '',
          h.ECO || '',
          h.Opening || '',
          year || '',
          gameDate || '',
        ].join(' ')),
      }

      batch.push(row)
      batchSlugs.add(slug)
      uploaded++

      if (batch.length >= BATCH_SIZE) {
        await upsertRows(batch)
        batch = []
        batchSlugs = new Set()
      }
    } catch (e) {
      failed++
      console.error(`Failed game ${i + 1}:`, e?.message || e)
    }
  }

  if (batch.length) {
    await upsertRows(batch)
  }

  console.log(
    `${path.basename(filePath)} done | uploaded: ${uploaded} | skipped: ${skipped} | failed: ${failed}`,
  )
}

async function main() {
  const files = getPgnFiles(INPUT_DIR)

  if (files.length === 0) {
    console.log(`No PGN files found in ${INPUT_DIR}`)
    return
  }

  for (const f of files) {
    await importFile(f)
  }

  console.log('Import complete.')
}

main().catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})