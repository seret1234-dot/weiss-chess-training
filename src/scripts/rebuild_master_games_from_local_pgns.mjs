import 'dotenv/config'
import fetch from 'node-fetch'
global.fetch = fetch

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import process from 'process'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars.')
  console.error('Need one of:')
  console.error('- VITE_SUPABASE_URL or SUPABASE_URL')
  console.error('- SUPABASE_SERVICE_ROLE_KEY (preferred) or VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

console.log('SUPABASE_URL loaded:', !!SUPABASE_URL)
console.log('SUPABASE_SERVICE_ROLE_KEY loaded:', !!SUPABASE_SERVICE_ROLE_KEY)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch,
  },
})

const ROOT = process.cwd()
const REBUILD_DIR = path.join(ROOT, 'pgn_rebuild', 'master_games')
const STORAGE_BUCKET = 'master-games'

function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function normalizeWhitespace(s) {
  return String(s || '').replace(/\r\n/g, '\n').trim()
}

function parsePgnHeaders(pgn) {
  const headers = {}
  const lines = normalizeWhitespace(pgn).split('\n')

  for (const line of lines) {
    const m = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/)
    if (!m) break
    headers[m[1]] = m[2]
  }

  return headers
}

function inferYear(headers) {
  const date = headers.Date || headers.UTCDate || ''
  const yearMatch = String(date).match(/^(\d{4})/)
  if (yearMatch) return Number(yearMatch[1])

  const event = headers.Event || ''
  const eventYearMatch = String(event).match(/\b(18|19|20)\d{2}\b/)
  if (eventYearMatch) return Number(eventYearMatch[0])

  return null
}

function buildSearchText(row, headers) {
  const parts = [
    row.title,
    row.white || headers.White,
    row.black || headers.Black,
    row.event || headers.Event,
    row.site || headers.Site,
    row.opening || headers.Opening,
    row.eco || headers.ECO,
    row.round || headers.Round,
    row.result || headers.Result,
    row.year || inferYear(headers),
    row.slug,
  ]

  return parts
    .filter(Boolean)
    .map((x) => String(x).trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function makeStorageKey(row, pgn) {
  const slugPart = row.slug ? slugify(row.slug) : `game-${row.id}`
  const hash = crypto.createHash('md5').update(pgn).digest('hex').slice(0, 10)
  return `${slugPart}-${hash}.pgn`
}

function findLocalPgnForRow(row) {
  const candidates = [
    row.slug ? path.join(REBUILD_DIR, `${row.slug}.pgn`) : null,
    path.join(REBUILD_DIR, `${row.id}.pgn`),
  ].filter(Boolean)

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return filePath
  }

  return null
}

async function uploadPgn(storageKey, pgnText) {
  const body = Buffer.from(pgnText, 'utf8')

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storageKey, body, {
      contentType: 'application/x-chess-pgn',
      upsert: true,
    })

  if (error) {
    throw new Error(`Storage upload failed for ${storageKey}: ${error.message}`)
  }
}

async function updateGameRow(row, headers, storageKey) {
  const next = {
    white: row.white || headers.White || null,
    black: row.black || headers.Black || null,
    event: row.event || headers.Event || null,
    site: row.site || headers.Site || null,
    year: row.year || inferYear(headers),
    round: row.round || headers.Round || null,
    result: row.result || headers.Result || null,
    opening: row.opening || headers.Opening || null,
    eco: row.eco || headers.ECO || null,
    title:
      row.title ||
      [row.white || headers.White, row.black || headers.Black]
        .filter(Boolean)
        .join(' vs ') ||
      null,
    description: row.description || null,
    pgn_storage_key: storageKey,
    search_text: buildSearchText(row, headers),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('master_games').update(next).eq('id', row.id)

  if (error) {
    throw new Error(`DB update failed for id=${row.id}: ${error.message}`)
  }

  return next
}

async function fetchTargetRows() {
  const pageSize = 1000
  let from = 0
  const rows = []

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('master_games')
      .select(
        'id, slug, title, white, black, event, site, year, round, result, opening, eco, description, pgn_storage_key'
      )
      .order('id', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(`Failed reading master_games: ${error.message}`)
    }

    if (!data || data.length === 0) break

    rows.push(...data)

    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function testConnection() {
  const { data, error } = await supabase.from('master_games').select('id, slug').limit(1)

  if (error) {
    throw new Error(`Supabase connection test failed: ${error.message}`)
  }

  console.log('Connection test OK. Sample rows:', data?.length ?? 0)
}

async function main() {
  if (!fs.existsSync(REBUILD_DIR)) {
    console.error(`Missing folder: ${REBUILD_DIR}`)
    process.exit(1)
  }

  await testConnection()

  const rows = await fetchTargetRows()

  if (rows.length === 0) {
    console.log('No rows found in master_games.')
    return
  }

  console.log(`Found ${rows.length} master_games rows.`)

  let matched = 0
  let updated = 0
  let skipped = 0
  let failed = 0

  const missing = []

  for (const row of rows) {
    try {
      const localFile = findLocalPgnForRow(row)

      if (!localFile) {
        skipped += 1
        missing.push({
          id: row.id,
          slug: row.slug || '',
          reason: 'No local PGN file found',
        })
        continue
      }

      matched += 1

      const pgnText = normalizeWhitespace(fs.readFileSync(localFile, 'utf8'))
      if (!pgnText) {
        throw new Error(`Empty PGN file: ${localFile}`)
      }

      const headers = parsePgnHeaders(pgnText)
      const storageKey = makeStorageKey(row, pgnText)

      await uploadPgn(storageKey, pgnText)
      await updateGameRow(row, headers, storageKey)

      updated += 1
      console.log(`Updated id=${row.id} slug=${row.slug || '-'} from ${path.basename(localFile)}`)
    } catch (err) {
      failed += 1
      console.error(`Failed id=${row.id} slug=${row.slug || '-'}: ${err.message}`)
    }
  }

  const report = {
    total_rows: rows.length,
    matched_local_files: matched,
    updated,
    skipped,
    failed,
    missing,
  }

  const reportPath = path.join(ROOT, 'pgn_rebuild', 'master_games_rebuild_report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

  console.log('\nDone.')
  console.log(`Updated: ${updated}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Failed: ${failed}`)
  console.log(`Report: ${reportPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})