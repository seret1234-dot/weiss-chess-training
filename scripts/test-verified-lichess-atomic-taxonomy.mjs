import assert from 'node:assert/strict'
import { ATOMIC_TAXONOMY_VERSION, COMPLETE_TAG_COVERAGE, RAW_TAG_CANDIDATES, candidateAtomicThemes, candidateTags, rawTags } from './lib/verified-lichess-atomic-taxonomy.mjs'
import { actualStage, CSV_COLUMNS, parseMoves } from './lib/verified-lichess-csv.mjs'

assert.equal(ATOMIC_TAXONOMY_VERSION, 'verified-lichess-tactics-v1-atomic-taxonomy')
assert.equal(CSV_COLUMNS.length, 10)
assert.deepEqual(parseMoves(' e2e4  e7e5 '), ['e2e4', 'e7e5'])
assert.equal(actualStage(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']), 2)
assert.deepEqual(rawTags({ Themes: 'fork pin' }), ['fork', 'pin'])
assert.deepEqual(candidateAtomicThemes(['fork']), RAW_TAG_CANDIDATES.fork)
for (const tag of candidateTags) assert.ok(COMPLETE_TAG_COVERAGE[tag], `candidate tag ${tag} must be covered`)
assert.equal(Object.keys(COMPLETE_TAG_COVERAGE).length, 70, 'every audited Lichess source tag is represented')
console.log('verified Lichess atomic taxonomy tests passed')
