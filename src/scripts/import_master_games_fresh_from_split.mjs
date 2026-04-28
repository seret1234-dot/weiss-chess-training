import 'dotenv/config'
import fetch from 'node-fetch'
global.fetch = fetch

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import process from 'process'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const SPLIT_DIR = path.join(ROOT, 'pgn_rebuild', 'split_games')
const STATE_DIR = path.join(ROOT, 'pgn_rebuild')
const STATE_PATH = path.join(STATE_DIR, 'fresh_import_state.json')
const FAILURES_PATH = path.join(STATE_DIR, 'fresh_import_failures.json')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch,
  },
})

const STORAGE_BUCKET = 'master-games-pgn'
const STORAGE_PREFIX = 'fresh-import-v1'
const INSERT_BATCH_SIZE = 100

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function normalizeNewlines(text) {
  return String(text || '').replace(/\r\n/g, '\n')
}

function safeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

function parseHeaders(pgnText) {
  const headers = {}
  const lines = normalizeNewlines(pgnText).split('\n')

  for (const line of lines) {
    const m = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/)
    if (!m) break
    headers[m[1]] = m[2]
  }

  return headers
}

function inferYear(headers) {
  const date = headers.Date || headers.UTCDate || ''
  const m = String(date).match(/^(\d{4})/)
  if (m) return Number(m[1])

  const event = headers.Event || ''
  const eventYear = String(event).match(/\b(18|19|20)\d{2}\b/)
  if (eventYear) return Number(eventYear[0])

  return null
}

function titleFromHeaders(headers) {
  const white = safeText(headers.White)
  const black = safeText(headers.Black)
  if (white && black) return `${white} vs ${black}`
  return white || black || 'Unknown game'
}

function buildSearchText(row) {
  return [
    row.title,
    row.white,
    row.black,
    row.event,
    row.site,
    row.round,
    row.result,
    row.opening,
    row.eco,
    row.year,
    row.slug,
  ]
    .filter(Boolean)
    .map((x) => safeText(x))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sha1(text) {
  return crypto.createHash('sha1').update(text).digest('hex')
}

function buildSlug(headers, relativePath, hash8) {
  const white = slugify(headers.White || 'white')
  const black = slugify(headers.Black || 'black')
  const year = inferYear(headers) || 'unknown'
  const event = slugify(headers.Event || path.basename(path.dirname(relativePath)) || 'event')
  return `${white}-vs-${black}-${year}-${event}-${hash8}`
}

function getAllPgnFilesRecursively(dirPath) {
  const out = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      out.push(...getAllPgnFilesRecursively(fullPath))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pgn')) {
      out.push(fullPath)
    }
  }

  return out
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) {
    return {
      nextIndex: 0,
      inserted: 0,
      uploaded: 0,
      failures: 0,
      duplicates: 0,
      lastFile: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
    return {
      nextIndex: parsed.nextIndex ?? 0,
      inserted: parsed.inserted ?? 0,
      uploaded: parsed.uploaded ?? 0,
      failures: parsed.failures ?? 0,
      duplicates: parsed.duplicates ?? 0,
      lastFile: parsed.lastFile ?? null,
      startedAt: parsed.startedAt ?? new Date().toISOString(),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    }
  } catch {
    return {
      nextIndex: 0,
      inserted: 0,
      uploaded: 0,
      failures: 0,
      duplicates: 0,
      lastFile: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }
}

function saveState(state) {
  ensureDir(STATE_DIR)
  state.updatedAt = new Date().toISOString()
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8')
}

function appendFailure(failure) {
  ensureDir(STATE_DIR)
  let arr = []
  if (fs.existsSync(FAILURES_PATH)) {
    try {
      arr = JSON.parse(fs.readFileSync(FAILURES_PATH, 'utf8'))
    } catch {
      arr = []
    }
  }
  arr.push(failure)
  fs.writeFileSync(FAILURES_PATH, JSON.stringify(arr, null, 2), 'utf8')
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
    throw new Error(`Storage upload failed: ${error.message}`)
  }
}

async function insertRows(rows) {
  if (rows.length === 0) {
    return { insertedCount: 0, duplicateCount: 0 }
  }

  const { data, error } = await supabase
    .from('master_games')
    .upsert(rows, {
      onConflict: 'slug',
      ignoreDuplicates: true,
    })
    .select('id, slug')

  if (error) {
    throw new Error(`DB insert failed: ${error.message}`)
  }

  const insertedCount = Array.isArray(data) ? data.length : 0
  const duplicateCount = rows.length - insertedCount

  return { insertedCount, duplicateCount }
}

async function main() {
  if (!fs.existsSync(SPLIT_DIR)) {
    console.error(`Missing split dir: ${SPLIT_DIR}`)
    process.exit(1)
  }

  const files = getAllPgnFilesRecursively(SPLIT_DIR).sort((a, b) => a.localeCompare(b))
  const totalFiles = files.length

  if (totalFiles === 0) {
    console.log('No PGN files found.')
    return
  }

  const state = loadState()

  console.log(`Total split PGNs: ${totalFiles}`)
  console.log(`Resuming from index: ${state.nextIndex}`)

  let pendingRows = []

  for (let i = state.nextIndex; i < totalFiles; i += 1) {
    const filePath = files[i]
    const relativePath = path.relative(SPLIT_DIR, filePath)

    try {
      const pgnText = normalizeNewlines(fs.readFileSync(filePath, 'utf8')).trim()
      if (!pgnText) {
        throw new Error('Empty PGN file')
      }

      const headers = parseHeaders(pgnText)

      const white = safeText(headers.White)
      const black = safeText(headers.Black)

      if (!white || !black) {
        throw new Error('Missing White/Black headers')
      }

      const whiteNorm = normalizeName(white)
      const blackNorm = normalizeName(black)

      if (!whiteNorm || !blackNorm) {
        throw new Error('Could not build white_norm/black_norm')
      }

      const hash = sha1(pgnText)
      const hash8 = hash.slice(0, 8)
      const slug = buildSlug(headers, relativePath, hash8)
      const year = inferYear(headers)

      const storageKey = `${STORAGE_PREFIX}/${slug}.pgn`

      await uploadPgn(storageKey, pgnText)

      const row = {
        slug,
        title: titleFromHeaders(headers),
        white,
        white_norm: whiteNorm,
        black,
        black_norm: blackNorm,
        event: safeText(headers.Event) || null,
        site: safeText(headers.Site) || null,
        year: year || null,
        round: safeText(headers.Round) || null,
        result: safeText(headers.Result) || null,
        opening: safeText(headers.Opening) || null,
        eco: safeText(headers.ECO) || null,
        description: null,
        pgn_storage_key: storageKey,
        search_text: '',
      }

      row.search_text = buildSearchText(row)

      pendingRows.push(row)
      state.uploaded += 1

      if (pendingRows.length >= INSERT_BATCH_SIZE) {
        const { insertedCount, duplicateCount } = await insertRows(pendingRows)
        state.inserted += insertedCount
        state.duplicates += duplicateCount
        pendingRows = []
        state.nextIndex = i + 1
        state.lastFile = relativePath
        saveState(state)
        console.log(
          `Inserted: ${state.inserted} / ${totalFiles} | Uploaded: ${state.uploaded} | Duplicates: ${state.duplicates} | Last: ${relativePath}`
        )
      }
    } catch (err) {
      state.failures += 1
      appendFailure({
        file: relativePath,
        error: err.message,
        at: new Date().toISOString(),
      })

      state.nextIndex = i + 1
      state.lastFile = relativePath
      saveState(state)

      console.error(`Failed: ${relativePath} | ${err.message}`)
    }
  }

  if (pendingRows.length > 0) {
    const { insertedCount, duplicateCount } = await insertRows(pendingRows)
    state.inserted += insertedCount
    state.duplicates += duplicateCount
    pendingRows = []
  }

  state.nextIndex = totalFiles
  saveState(state)

  console.log('\nDone.')
  console.log(`Inserted rows: ${state.inserted}`)
  console.log(`Uploaded files: ${state.uploaded}`)
  console.log(`Duplicates skipped: ${state.duplicates}`)
  console.log(`Failures: ${state.failures}`)
  console.log(`State: ${STATE_PATH}`)
  console.log(`Failures log: ${FAILURES_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})