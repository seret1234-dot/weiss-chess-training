import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { replayPuzzleToTerminal } from './lib/detect-smothered-mate.mjs'
import { detectAllMateThemes } from './lib/detect-mate-themes.mjs'

const root = process.cwd()
const corpus = join(root, 'public/data/master-puzzles/v1')
const indexRoot = join(corpus, 'indexes')
const generatedRoot = join(root, 'generated/master-mates/v1')
const distances = [1, 2, 3, 4]
const expectedDistances = { 1: 1987, 2: 2261, 3: 2196, 4: 6410 }
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

async function canonicalSnapshot() {
  const files = (await readdir(join(corpus, 'puzzles'))).filter((name) => /^chunk-\d+\.json$/.test(name)).sort()
  const hash = createHash('sha256')
  let bytes = 0
  for (const file of files) {
    const path = join(corpus, 'puzzles', file)
    hash.update(file); hash.update('\0'); hash.update(await readFile(path)); bytes += (await stat(path)).size
  }
  return { shardCount: files.length, bytes, aggregateSha256: hash.digest('hex') }
}

const [catalog, classification, summary] = await Promise.all([
  readJson(join(indexRoot, 'mates-theme-catalog.json')),
  readJson(join(generatedRoot, 'mate-theme-classification.json')),
  readJson(join(generatedRoot, 'mate-theme-classification-summary.json')),
])
assert.equal(classification.rows.length, 12854)
assert.equal(new Set(classification.rows.map((row) => row.id)).size, 12854)
assert.equal(catalog.inputCount, 12854)
assert.deepEqual(catalog.primaryOrder, classification.primaryPolicy.standardUpstreamPriority.concat(classification.primaryPolicy.killBoxAfterStandard))
assert.deepEqual(classification.inputDistanceTotals, expectedDistances)

const sourceRefs = new Map()
for (const distance of distances) {
  const index = await readJson(join(indexRoot, `mates-distance-${distance}.json`))
  assert.equal(index.refs.length, expectedDistances[distance])
  for (const ref of index.refs) {
    assert(!sourceRefs.has(ref.id), `Duplicate source Master Mate ${ref.id}`)
    sourceRefs.set(ref.id, { ...ref, distance })
  }
}
assert.equal(sourceRefs.size, 12854)

const rowById = new Map(classification.rows.map((row) => [row.id, row]))
for (const [id, ref] of sourceRefs) {
  const row = rowById.get(id)
  assert.ok(row, `Lost Master Mate ${id}`)
  assert.equal(row.chunk, ref.chunk, `${id} changed canonical chunk`)
  assert.equal(row.distance, ref.distance, `${id} changed Master distance`)
  assert.equal(row.terminal, true, `${id} is not terminal`)
}

const primaryIndexIds = new Set()
for (const [key, filename] of Object.entries(catalog.indexes.byDistanceAndTheme)) {
  const [distanceText, theme] = key.split(':')
  const distance = Number(distanceText)
  const index = await readJson(join(indexRoot, filename))
  for (const ref of index.refs) {
    assert(!primaryIndexIds.has(ref.id), `Duplicate primary index membership ${ref.id}`)
    primaryIndexIds.add(ref.id)
    const row = rowById.get(ref.id)
    assert.ok(row, `Index contains non-source ID ${ref.id}`)
    assert.equal(row.distance, distance, `${ref.id} index distance mismatch`)
    assert.equal(row.primaryTheme, theme, `${ref.id} index theme mismatch`)
    assert.equal(row.chunk, ref.chunk, `${ref.id} index chunk mismatch`)
  }
}
assert.equal(primaryIndexIds.size, 12854)
assert.deepEqual([...primaryIndexIds].sort(), [...sourceRefs.keys()].sort())

const chunks = new Map()
async function puzzleFor(ref) {
  if (!chunks.has(ref.chunk)) {
    const payload = await readJson(join(corpus, 'puzzles', `chunk-${String(ref.chunk).padStart(5, '0')}.json`))
    chunks.set(ref.chunk, new Map(payload.puzzles.map((puzzle) => [puzzle.id, puzzle])))
  }
  const puzzle = chunks.get(ref.chunk).get(ref.id)
  assert.ok(puzzle, `Missing canonical puzzle ${ref.id}`)
  return puzzle
}
for (const ref of sourceRefs.values()) await puzzleFor(ref)

const zeroIds = new Set(classification.rows.filter((row) => row.matchedThemes.length === 0).map((row) => row.id))
const mixedIds = new Set(classification.rows.filter((row) => row.primaryTheme === 'mixed').map((row) => row.id))
assert.deepEqual([...mixedIds].sort(), [...zeroIds].sort(), 'Mixed must contain every and only zero-detector Master Mate')
for (const row of classification.rows.filter((row) => row.matchedThemes.length > 1)) {
  assert.ok(row.detectorEvidence[row.primaryTheme], `${row.id} lost winning primary evidence`)
}

for (const theme of catalog.primaryOrder) {
  const samples = classification.rows.filter((row) => row.matchedThemes.includes(theme)).slice(0, 20)
  for (const row of samples) {
    const puzzle = await puzzleFor(row)
    const results = detectAllMateThemes({ id: puzzle.id, fen: puzzle.fen, solutionLine: puzzle.solution.map((step) => step.uci) })
    assert.equal(results[theme].matched, true, `${row.id} lost ${theme} detector evidence`)
    assert.deepEqual(row.detectorEvidence[theme], results[theme].evidence, `${row.id} detector evidence drifted`)
  }
}
const mixedSamples = classification.rows.filter((row) => row.primaryTheme === 'mixed').slice(0, 50)
assert.equal(mixedSamples.length, 50)
for (const row of mixedSamples) {
  const puzzle = await puzzleFor(row)
  const record = { id: puzzle.id, fen: puzzle.fen, solutionLine: puzzle.solution.map((step) => step.uci) }
  const replay = replayPuzzleToTerminal(record)
  const results = detectAllMateThemes(record)
  assert.equal(replay.game.isCheckmate(), true, `${row.id} Mixed QA terminal failure`)
  assert.equal(Object.values(results).some((result) => result.matched), false, `${row.id} Mixed QA has named detector match`)
}

const snapshot = await canonicalSnapshot()
assert.deepEqual(snapshot, classification.canonicalSnapshot, 'Canonical shard snapshot changed during classification')
assert.deepEqual(snapshot, summary.canonicalSnapshot, 'Summary canonical snapshot mismatch')
console.log(JSON.stringify({ input: sourceRefs.size, primaryAssigned: primaryIndexIds.size, mixed: mixedIds.size, namedQaThemes: catalog.primaryOrder.length, mixedQa: mixedSamples.length, canonicalSnapshot: snapshot, classificationHash: classification.classificationHash }))
