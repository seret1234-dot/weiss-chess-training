import assert from 'node:assert/strict'
import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createClient } from '@supabase/supabase-js'
import {
  buildMasterGameSearchRpcArgs,
  MASTER_GAMES_FLEXIBLE_SEARCH_RPC,
} from '../src/masterGamesFlexibleSearch.mjs'

const supabaseSource = fs.readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8')

function sourceConstant(name) {
  const match = supabaseSource.match(new RegExp(`const ${name} = '([^']+)'`))
  assert.ok(match, `missing ${name}`)
  return match[1]
}

const supabase = createClient(sourceConstant('supabaseUrl'), sourceConstant('supabaseKey'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const baseFilters = {
  query: '',
  player1: '',
  player2: '',
  opening: '',
  event: '',
  result: '',
  colorFilter: 'all',
  yearFrom: '',
  yearTo: '',
  sortBy: 'newest',
}

const representativeIds = [75439, 75483, 75699, 75701, 75703]
const { count: masterGameCount, error: countError } = await supabase
  .from('master_games')
  .select('id', { count: 'exact', head: true })
assert.ifError(countError)
assert.equal(masterGameCount, 132365)

const { data: representativeRows, error: representativeError } = await supabase
  .from('master_games')
  .select('id,slug,white,black,result,event,site,year,eco')
  .in('id', representativeIds)
  .order('id')
assert.ifError(representativeError)
assert.deepEqual(representativeRows.map((row) => Number(row.id)), representativeIds)

async function runSearch(label, filters, page = 1, pageSize = 30) {
  const args = buildMasterGameSearchRpcArgs({ ...baseFilters, ...filters, page, pageSize })
  const started = performance.now()
  const { data, error } = await supabase.rpc(MASTER_GAMES_FLEXIBLE_SEARCH_RPC, args)
  const elapsedMs = Math.round(performance.now() - started)
  assert.ifError(error)
  const rows = data ?? []
  const total = Number(rows[0]?.total_count ?? 0)
  return { label, args, rows, total, elapsedMs }
}

function hasPlayers(row, first, second) {
  const names = `${row.white} ${row.black}`.toLowerCase()
  return names.includes(first) && names.includes(second)
}

function compact(result) {
  return {
    total: result.total,
    pageRows: result.rows.length,
    elapsedMs: result.elapsedMs,
    top: result.rows.slice(0, 3).map((row) => ({
      id: row.id,
      white: row.white,
      black: row.black,
      opening: row.opening,
      eco: row.eco,
      year: row.year,
    })),
  }
}

const a1 = await runSearch('A exact pair page 1', { query: 'fischer vs spassky' }, 1)
const a2 = await runSearch('A exact pair page 2', { query: 'fischer vs spassky' }, 2)
const b = await runSearch('B typo pair', { query: 'fisher vs spasky' })
const c = await runSearch('C dedicated pair', { player1: 'Fischer', player2: 'Spassky' })
const d = await runSearch('D pair Fischer white', {
  player1: 'Fischer', player2: 'Spassky', colorFilter: 'white',
})
const e = await runSearch('E Robert Fischer', { player1: 'robert fischer' })
const f = await runSearch('F Ruy Lopez', { opening: 'ruy lopez' })
const g = await runSearch('G Ruy Lopes typo', { opening: 'ruy lopes' })
const h = await runSearch('H Sicilian', { opening: 'sicilian' })
const i = await runSearch('I ECO B90', { opening: 'B90' })
const j = await runSearch('J Fischer Ruy 1960-1992', {
  player1: 'Fischer', opening: 'ruy lopez', yearFrom: '1960', yearTo: '1992',
})

assert.equal(a1.total, 56)
assert.equal(a2.total, 56)
assert.equal(a1.rows.length, 30)
assert.equal(a2.rows.length, 26)
assert.ok([...a1.rows, ...a2.rows].every((row) => hasPlayers(row, 'fischer', 'spassky')))
assert.equal(new Set([...a1.rows, ...a2.rows].map((row) => row.id)).size, 56)
assert.equal(b.total, 56)
assert.ok(b.rows.every((row) => hasPlayers(row, 'fischer', 'spassky')))
assert.equal(c.total, 56)
assert.equal(d.total, 27)
assert.ok(d.rows.every((row) => row.white.toLowerCase().includes('fischer') && row.black.toLowerCase().includes('spassky')))
assert.ok(e.total > 0 && e.rows.every((row) => hasPlayers(row, 'fischer', '')))
assert.ok(f.total > 0 && f.rows.every((row) => row.eco >= 'C60' && row.eco <= 'C99'))
assert.ok(g.total > 0 && g.rows.every((row) => row.eco >= 'C60' && row.eco <= 'C99'))
assert.ok(h.total > 0 && h.rows.every((row) => row.eco >= 'B20' && row.eco <= 'B99'))
assert.ok(i.total > 0 && i.rows.every((row) => row.eco === 'B90'))
assert.ok(j.total > 0 && j.rows.every((row) => {
  const names = `${row.white} ${row.black}`.toLowerCase()
  return names.includes('fischer') && row.eco >= 'C60' && row.eco <= 'C99' && row.year >= 1960 && row.year <= 1992
}))

const typoChecks = {
  fisher: await runSearch('typo fisher', { player1: 'fisher' }),
  spasky: await runSearch('typo spasky', { player1: 'spasky' }),
  sicillian: await runSearch('typo sicillian', { opening: 'sicillian' }),
  najdrof: await runSearch('typo najdrof', { opening: 'najdrof' }),
}

assert.ok(typoChecks.fisher.rows.some((row) => `${row.white} ${row.black}`.toLowerCase().includes('fischer')))
assert.ok(typoChecks.spasky.rows.every((row) => `${row.white} ${row.black}`.toLowerCase().includes('spassky')))
assert.ok(typoChecks.sicillian.total > 0 && typoChecks.sicillian.rows.every((row) => row.eco >= 'B20' && row.eco <= 'B99'))
assert.ok(typoChecks.najdrof.total > 0 && typoChecks.najdrof.rows.every((row) => row.eco >= 'B90' && row.eco <= 'B99'))

const results = { a1, a2, b, c, d, e, f, g, h, i, j }
console.log(JSON.stringify({
  passed: true,
  corpusIntegrity: {
    rowCount: masterGameCount,
    representativeRows,
  },
  cases: Object.fromEntries(Object.entries(results).map(([key, value]) => [key, compact(value)])),
  typoChecks: Object.fromEntries(Object.entries(typoChecks).map(([key, value]) => [key, compact(value)])),
  pagination: {
    total: a1.total,
    page1: a1.rows.length,
    page2: a2.rows.length,
    uniqueIds: new Set([...a1.rows, ...a2.rows].map((row) => row.id)).size,
  },
}, null, 2))
