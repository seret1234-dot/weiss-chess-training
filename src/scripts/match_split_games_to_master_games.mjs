import 'dotenv/config'
import fetch from 'node-fetch'
global.fetch = fetch

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const SPLIT_DIR = path.join(ROOT, 'pgn_rebuild', 'split_games')
const MATCHED_DIR = path.join(ROOT, 'pgn_rebuild', 'master_games')
const REPORT_PATH = path.join(ROOT, 'pgn_rebuild', 'master_games_fuzzy_match_report.json')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { global: { fetch } }
)

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function parseHeaders(pgn) {
  const h = {}
  for (const line of pgn.split('\n')) {
    const m = line.match(/^\[(\w+)\s+"(.*)"\]$/)
    if (!m) break
    h[m[1]] = m[2]
  }
  return h
}

function getYear(headers) {
  const m = String(headers.Date || '').match(/^(\d{4})/)
  return m ? Number(m[1]) : null
}

function getFiles(dir) {
  const out = []
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name)
    if (f.isDirectory()) out.push(...getFiles(full))
    else if (f.name.toLowerCase().endsWith('.pgn')) out.push(full)
  }
  return out
}

function normalizeNameParts(name) {
  const cleaned = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,;:!?'"`()\[\]{}]/g, ' ')
    .replace(/\b(jr|sr|gm|im|fm|wgm|wim)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return []

  return cleaned.split(' ').filter(Boolean)
}

function canonicalNameKeys(name) {
  const parts = normalizeNameParts(name)
  if (parts.length === 0) return []

  const set = new Set()
  const joined = parts.join('')
  set.add(joined)

  if (parts.length >= 2) {
    const first = parts[0]
    const last = parts[parts.length - 1]
    set.add(first + last)
    set.add(last + first)
    set.add(last)
    set.add(first)
    set.add(last + (first[0] || ''))
    set.add((first[0] || '') + last)
  } else {
    set.add(parts[0])
  }

  return Array.from(set)
}

function surnameKey(name) {
  const parts = normalizeNameParts(name)
  return parts.length ? parts[parts.length - 1] : ''
}

function firstInitialKey(name) {
  const parts = normalizeNameParts(name)
  return parts.length ? parts[0][0] : ''
}

function namesMatchStrong(a, b) {
  const aKeys = new Set(canonicalNameKeys(a))
  const bKeys = new Set(canonicalNameKeys(b))

  for (const k of aKeys) {
    if (bKeys.has(k)) return true
  }

  const aSurname = surnameKey(a)
  const bSurname = surnameKey(b)
  const aInitial = firstInitialKey(a)
  const bInitial = firstInitialKey(b)

  if (aSurname && bSurname && aSurname === bSurname) {
    if (!aInitial || !bInitial) return true
    if (aInitial === bInitial) return true
  }

  return false
}

function namesMatchLoose(a, b) {
  const aParts = new Set(normalizeNameParts(a))
  const bParts = new Set(normalizeNameParts(b))

  if (!aParts.size || !bParts.size) return false

  let overlap = 0
  for (const p of aParts) {
    if (bParts.has(p)) overlap++
  }

  if (overlap >= 2) return true

  const aSurname = surnameKey(a)
  const bSurname = surnameKey(b)
  return !!aSurname && aSurname === bSurname
}

function scoreRowToGame(row, headers) {
  let score = 0

  const whiteStrong = namesMatchStrong(row.white, headers.White)
  const blackStrong = namesMatchStrong(row.black, headers.Black)
  const whiteLoose = namesMatchLoose(row.white, headers.White)
  const blackLoose = namesMatchLoose(row.black, headers.Black)

  if (whiteStrong) score += 50
  else if (whiteLoose) score += 25

  if (blackStrong) score += 50
  else if (blackLoose) score += 25

  const rowYear = Number(row.year || 0) || null
  const gameYear = getYear(headers)

  if (rowYear && gameYear) {
    if (rowYear === gameYear) score += 20
    else if (Math.abs(rowYear - gameYear) === 1) score += 8
    else if (Math.abs(rowYear - gameYear) <= 3) score += 2
  }

  return score
}

async function main() {
  ensureDir(MATCHED_DIR)

  const { data: rows, error } = await supabase
    .from('master_games')
    .select('id, slug, white, black, year')
    .order('id', { ascending: true })

  if (error) {
    console.error(error)
    process.exit(1)
  }

  const files = getFiles(SPLIT_DIR)

  console.log('rows:', rows.length)
  console.log('files:', files.length)

  const usedRowIds = new Set()
  const usedFilePaths = new Set()
  const report = []

  let copied = 0

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (i % 5000 === 0) console.log('progress:', i)

    const pgn = fs.readFileSync(file, 'utf8')
    const headers = parseHeaders(pgn)

    if (!headers.White || !headers.Black) continue

    let bestRow = null
    let bestScore = 0
    let secondScore = 0

    for (const row of rows) {
      if (usedRowIds.has(row.id)) continue

      const sc = scoreRowToGame(row, headers)
      if (sc > bestScore) {
        secondScore = bestScore
        bestScore = sc
        bestRow = row
      } else if (sc > secondScore) {
        secondScore = sc
      }
    }

    if (!bestRow) continue

    const strongEnough =
      bestScore >= 90 || (bestScore >= 75 && bestScore - secondScore >= 20)

    report.push({
      file,
      white: headers.White || '',
      black: headers.Black || '',
      year: getYear(headers),
      bestRowId: bestRow.id,
      bestRowWhite: bestRow.white,
      bestRowBlack: bestRow.black,
      bestRowYear: bestRow.year,
      bestScore,
      secondScore,
      copied: strongEnough,
    })

    if (!strongEnough) continue
    if (usedFilePaths.has(file)) continue

    const out = path.join(MATCHED_DIR, `${bestRow.id}.pgn`)
    if (!fs.existsSync(out)) {
      fs.writeFileSync(out, pgn)
      usedRowIds.add(bestRow.id)
      usedFilePaths.add(file)
      copied++
    }
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')

  console.log('Copied:', copied)
  console.log('Report:', REPORT_PATH)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})