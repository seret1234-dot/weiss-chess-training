import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { createClient } from '@supabase/supabase-js'
import { normalizeOpeningSearchText, prepareOpeningSearchRecords, searchOpeningRecords } from '../src/openings/openingSearch.mjs'

const supabase = createClient(
  'https://lahzgtcpbshmzsqoqswf.supabase.co',
  'sb_publishable_Mh6jBwj622QGXK4MtHWrqQ_UUZL3NuB',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const fields = 'id,slug,name,family,family_slug,variation,subvariation,eco,aliases,ply_count'
const catalog = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('opening_lines').select(fields).order('id').range(from, from + 999)
  assert.ifError(error)
  catalog.push(...(data ?? []))
  if ((data ?? []).length < 1000) break
}

assert.equal(catalog.length, 3691, 'exact canonical opening line count')
assert.equal(new Set(catalog.map((line) => line.id)).size, catalog.length, 'canonical IDs are unique')
assert.equal(new Set(catalog.map((line) => line.family)).size, 148, 'exact family count')
assert.equal(new Set(catalog.map((line) => line.eco).filter(Boolean)).size, 498, 'exact ECO count')
prepareOpeningSearchRecords(catalog)

assert.equal(normalizeOpeningSearchText(" Queen’s   Gambit "), 'queens gambit')
assert.equal(normalizeOpeningSearchText('Caro-Kann'), 'caro kann')
assert.equal(normalizeOpeningSearchText('Grünfeld'), 'grunfeld')

const strictFamilySearch = (query) => catalog.filter((line) =>
  `${line.family} ${line.family_slug}`.toLowerCase().includes(query.toLowerCase()),
)
assert.equal(strictFamilySearch('ruy lopes').length, 0)
assert.equal(strictFamilySearch('sicillian').length, 0)
assert.equal(strictFamilySearch('najdrof').length, 0)
assert.equal(strictFamilySearch('B90').length, 0)

const cases = [
  ['A', 'ruy lopez', /ruy lopez/i],
  ['B', 'ruy lopes', /ruy lopez/i],
  ['C', 'sicilian', /sicilian/i],
  ['D', 'sicillian', /sicilian/i],
  ['E', 'najdorf', /najdorf/i],
  ['F', 'najdrof', /najdorf/i],
  ['G', 'B90', /B90/i],
  ['H', "queen's gambit", /queen.?s gambit/i],
  ['I', 'queens gambbit', /queen.?s gambit/i],
  ['J', 'caro kann', /caro.?kann/i],
  ['K', 'caro kan', /caro.?kann/i],
]

const results = []
for (const [label, query, expected] of cases) {
  const started = performance.now()
  const matches = searchOpeningRecords(catalog, query)
  const elapsedMs = performance.now() - started
  assert.ok(matches.length > 0, `${label}: ${query} returns results`)
  const representative = matches.slice(0, 10)
  assert.ok(representative.some((line) => expected.test(`${line.name} ${line.family} ${line.variation} ${line.eco}`)), `${label}: top results are relevant`)
  results.push({ label, query, matches: matches.length, elapsedMs: Number(elapsedMs.toFixed(3)), first: matches[0].name })
}

assert.ok(searchOpeningRecords(catalog, 'Poisoned Pawn').every((line) => /poisoned pawn/i.test(`${line.name} ${line.variation} ${line.subvariation}`)))
assert.ok(searchOpeningRecords(catalog, 'gambit queens').length > 0, 'flexible token order works')

const actualCorpus = {
  ruyLopez: catalog.filter((line) => /ruy lopez/i.test(`${line.name} ${line.family} ${line.variation} ${line.subvariation}`)).length,
  sicilian: catalog.filter((line) => /sicilian/i.test(`${line.name} ${line.family} ${line.variation} ${line.subvariation}`)).length,
  najdorf: catalog.filter((line) => /najdorf/i.test(`${line.name} ${line.family} ${line.variation} ${line.subvariation}`)).length,
  b90: catalog.filter((line) => String(line.eco).toUpperCase() === 'B90').length,
  queensGambit: catalog.filter((line) => /queen.?s gambit/i.test(`${line.name} ${line.family} ${line.variation} ${line.subvariation}`)).length,
  caroKann: catalog.filter((line) => /caro.?kann/i.test(`${line.name} ${line.family} ${line.variation} ${line.subvariation}`)).length,
}

console.log(JSON.stringify({ passed: true, corpus: { lines: catalog.length, families: 148, ecoCodes: 498, metadataBytes: Buffer.byteLength(JSON.stringify(catalog)), ...actualCorpus }, results }, null, 2))
