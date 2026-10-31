import assert from 'node:assert/strict'
import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createClient } from '@supabase/supabase-js'
import {
  buildMasterGameSearchRpcArgs,
  MASTER_GAME_PLAYER_SUGGESTIONS_RPC,
  MASTER_GAMES_FLEXIBLE_SEARCH_RPC,
  normalizeMasterGameSearchText,
  parseMasterGamePlayerPair,
} from '../src/masterGamesFlexibleSearch.mjs'

const pageSource = fs.readFileSync(new URL('../src/MasterGamesLibraryPage.tsx', import.meta.url), 'utf8')
const migrationPath = new URL('../supabase/migrations-archive/20260905135700_master_games_flexible_search.sql', import.meta.url)
const migration = fs.readFileSync(migrationPath, 'utf8')
const supabaseSource = fs.readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8')

function sourceConstant(name) {
  const match = supabaseSource.match(new RegExp(`const ${name} = '([^']+)'`))
  assert.ok(match, `missing ${name}`)
  return match[1]
}

function levenshtein(left, right) {
  const a = normalizeMasterGameSearchText(left)
  const b = normalizeMasterGameSearchText(right)
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const old = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = old
    }
  }
  return row[b.length]
}

function tokenMatch(haystack, query) {
  const haystackTokens = normalizeMasterGameSearchText(haystack).split(' ').filter(Boolean)
  const queryTokens = normalizeMasterGameSearchText(query).split(' ').filter((token) => token.length >= 2)
  return queryTokens.every((queryToken) => haystackTokens.some((token) => {
    if (token === queryToken || token.startsWith(queryToken) || queryToken.startsWith(token)) return true
    const maxDistance = queryToken.length >= 7 ? 2 : queryToken.length >= 5 ? 1 : 0
    return levenshtein(token, queryToken) <= maxDistance
  }))
}

assert.equal(normalizeMasterGameSearchText('  FÍSCHER,  Robert-James  '), 'fischer robert james')
assert.equal(normalizeMasterGameSearchText("O’Kelly  --  de Galway"), 'okelly de galway')
assert.deepEqual(parseMasterGamePlayerPair('Fischer vs Spassky'), { player1: 'fischer', player2: 'spassky' })
assert.deepEqual(parseMasterGamePlayerPair('fisher v. spasky'), { player1: 'fisher', player2: 'spasky' })
assert.deepEqual(parseMasterGamePlayerPair('Fischer - Spassky'), { player1: 'fischer', player2: 'spassky' })
assert.equal(parseMasterGamePlayerPair('world championship'), null)

const pairArgs = buildMasterGameSearchRpcArgs({
  query: 'fischer vs spassky', player1: '', player2: '', opening: '', event: '', result: '',
  colorFilter: 'all', yearFrom: '', yearTo: '', sortBy: 'newest', page: 2, pageSize: 30,
})
assert.equal(pairArgs.p_q, '')
assert.equal(pairArgs.p_player_1, 'fischer')
assert.equal(pairArgs.p_player_2, 'spassky')
assert.equal(pairArgs.p_page_num, 2)

const dedicatedArgs = buildMasterGameSearchRpcArgs({
  query: '', player1: 'Robert Fischer', player2: 'Boris Spassky', opening: 'Ruy Lopes', event: '', result: '',
  colorFilter: 'white', yearFrom: '1960', yearTo: '1992', sortBy: 'oldest', page: 1, pageSize: 30,
})
assert.equal(dedicatedArgs.p_player_1, 'robert fischer')
assert.equal(dedicatedArgs.p_player_2, 'boris spassky')
assert.equal(dedicatedArgs.p_opening, 'ruy lopes')
assert.equal(dedicatedArgs.p_player_1_color, 'white')

const genericTokens = buildMasterGameSearchRpcArgs({
  query: 'fischer reykjavik 1972', player1: '', player2: '', opening: '', event: '', result: '',
  colorFilter: 'all', yearFrom: '', yearTo: '', sortBy: 'newest', page: 1, pageSize: 30,
})
assert.equal(genericTokens.p_q, 'fischer reykjavik 1972')
assert.equal(genericTokens.p_player_1, '')

assert.ok(tokenMatch('Fischer, Robert James', 'Robert Fischer'))
assert.ok(tokenMatch('Fischer, Robert James', 'fisher'))
assert.ok(tokenMatch('Spassky, Boris V', 'spasky'))
assert.ok(tokenMatch('Ruy Lopez Spanish Opening', 'ruy lopes'))
assert.ok(tokenMatch('Sicilian Defense', 'sicillian'))
assert.ok(tokenMatch('Sicilian Defense Najdorf Variation', 'najdrof'))
assert.equal(tokenMatch('Fischer, Robert James', 'Fishburn'), false)

assert.match(pageSource, /Player 1/)
assert.match(pageSource, /Player 2 \(optional\)/)
assert.match(pageSource, /Player 1 color/)
assert.match(pageSource, /MASTER_GAMES_FLEXIBLE_SEARCH_RPC/)
assert.match(pageSource, /MASTER_GAME_PLAYER_SUGGESTIONS_RPC/)
assert.match(pageSource, /SEARCH_DEBOUNCE_MS = 300/)

assert.match(migration, /create or replace function public\.search_master_games_flexible/i)
assert.match(migration, /create or replace function public\.master_game_player_suggestions_flexible/i)
assert.match(migration, /create table if not exists public\.master_game_player_search_catalog/i)
assert.match(migration, /create table if not exists public\.master_game_opening_search_catalog/i)
assert.match(migration, /query_player_candidates as materialized/i)
assert.match(migration, /query_opening_candidates as materialized/i)
assert.match(migration, /security invoker/gi)
assert.match(migration, /gin_trgm_ops/)
assert.match(migration, /Ruy Lopez \/ Spanish Opening/)
assert.match(migration, /Sicilian Defense · Najdorf Variation/)
assert.match(migration, /count\(\*\) over \(\)/)
assert.doesNotMatch(migration, /security definer/i)

const supabase = createClient(sourceConstant('supabaseUrl'), sourceConstant('supabaseKey'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const select = 'id,slug,white,black,white_norm,black_norm,event,site,year,opening,eco,result'

async function timed(label, operation) {
  const started = performance.now()
  const { data, error } = await operation
  const elapsedMs = Math.round(performance.now() - started)
  assert.ifError(error)
  return { label, data: data ?? [], elapsedMs }
}

const whiteFischer = await timed('surname-white', supabase.from('master_games').select(select).ilike('white_norm', '%fischer%').limit(1000))
const blackFischer = await timed('surname-black', supabase.from('master_games').select(select).ilike('black_norm', '%fischer%').limit(1000))
const whiteFischerBlackSpassky = await timed(
  'pair-white',
  supabase.from('master_games').select(select).ilike('white_norm', '%fischer%').ilike('black_norm', '%spassky%').limit(100),
)
const whiteSpasskyBlackFischer = await timed(
  'pair-black',
  supabase.from('master_games').select(select).ilike('white_norm', '%spassky%').ilike('black_norm', '%fischer%').limit(100),
)
const ruy = await timed('opening-ruy-eco', supabase.from('master_games').select(select).gte('eco', 'C60').lte('eco', 'C99').limit(100))
const sicilian = await timed('opening-sicilian-eco', supabase.from('master_games').select(select).gte('eco', 'B20').lte('eco', 'B99').limit(100))
const najdorf = await timed('opening-najdorf-eco', supabase.from('master_games').select(select).gte('eco', 'B90').lte('eco', 'B99').limit(100))

const pairRows = [...whiteFischerBlackSpassky.data, ...whiteSpasskyBlackFischer.data]
const pairIds = new Set(pairRows.map((game) => game.id))
assert.equal(pairRows.length, 56, 'actual corpus Fischer–Spassky count')
assert.equal(pairIds.size, 56, 'Fischer–Spassky IDs must be unique')
assert.ok(pairRows.every((game) => {
  const names = `${game.white} ${game.black}`
  return tokenMatch(names, 'fisher') && tokenMatch(names, 'spasky')
}))
assert.ok(whiteFischerBlackSpassky.data.every((game) => tokenMatch(game.white, 'Fischer') && tokenMatch(game.black, 'Spassky')))
assert.ok(whiteFischer.data.length + blackFischer.data.length > pairRows.length)
assert.ok(ruy.data.length > 0 && ruy.data.every((game) => game.eco >= 'C60' && game.eco <= 'C99'))
assert.ok(sicilian.data.length > 0 && sicilian.data.every((game) => game.eco >= 'B20' && game.eco <= 'B99'))
assert.ok(najdorf.data.length > 0 && najdorf.data.every((game) => game.eco >= 'B90' && game.eco <= 'B99'))

const allFischer = [...whiteFischer.data, ...blackFischer.data]
const combined = allFischer.filter((game) => game.year >= 1960 && game.year <= 1992 && game.eco >= 'C60' && game.eco <= 'C99')
assert.ok(combined.length > 0)
assert.ok(combined.every((game) => tokenMatch(`${game.white} ${game.black}`, 'Fischer')))

const timings = [whiteFischer, blackFischer, whiteFischerBlackSpassky, whiteSpasskyBlackFischer, ruy, sicilian, najdorf]
  .map(({ label, elapsedMs, data }) => ({ label, elapsedMs, rows: data.length }))

console.log(JSON.stringify({
  passed: true,
  actualCorpus: {
    fischerSpassky: pairRows.length,
    fischerAsWhite: whiteFischerBlackSpassky.data.length,
    fischerAsBlack: whiteSpasskyBlackFischer.data.length,
    representativeIds: pairRows.slice(0, 5).map((game) => game.id),
    storedNames: [...new Set(pairRows.flatMap((game) => [game.white, game.black]))],
    representativeOpenings: pairRows.slice(0, 5).map((game) => ({ id: game.id, opening: game.opening, eco: game.eco })),
  },
  timings,
  combinedFixtureCount: combined.length,
}, null, 2))
