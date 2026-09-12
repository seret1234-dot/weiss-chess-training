import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { orientMasterGamePlayers } from '../src/components/chess/masterGamePlayerLabels.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dataRoot = join(root, 'public/data/master-puzzles/v1')
const catalog = JSON.parse(await readFile(join(dataRoot, 'catalog.json'), 'utf8'))
const taxonomySource = await readFile(join(root, 'src/trainers/patternTactic/generatedFinalVerifiedTaxonomy.ts'), 'utf8')
const badQueenSkewer = 'mtc2_0000eb20561f78aa32452ee41c7068723e2538690514931f5bbaa9e022ba3924'
const badBishopFork = 'mtc2_027752853c51dbdeaf773be7588b2d95f812aeb4c6637bdbd777a61ab95baff6'

let namedMemberships = 0
let mixedMemberships = 0
let namedIndexes = 0
for (const distance of [1, 2, 3, 4]) {
 const themes = catalog.tactics[String(distance)]?.themes ?? {}
 for (const [theme, expectedCount] of Object.entries(themes)) {
  const file = `tactics-course-${distance}-${theme}.json`
  const path = join(dataRoot, 'indexes', file)
  assert.ok(existsSync(path), `Missing Master Tactics index ${file}`)
  const index = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(index.distance, distance)
  assert.equal(index.theme, theme)
  assert.equal(index.refs.length, expectedCount)
  assert.equal(new Set(index.refs.map((ref) => ref.id)).size, index.refs.length, `${file} contains duplicate IDs`)
  assert.match(taxonomySource, new RegExp(`"theme": "${theme}"[\\s\\S]{0,160}"stage": ${distance}`), `${theme}:${distance} is not an active regular taxonomy combination`)
  if (theme === 'queen-skewer') assert.ok(!index.refs.some((ref) => ref.id === badQueenSkewer), 'Grischuk–Adams false Queen Skewer returned')
  if (theme === 'bishop-fork') assert.ok(!index.refs.some((ref) => ref.id === badBishopFork), 'Sorensen–Gukesh false Bishop Fork returned')
  namedMemberships += index.refs.length
  namedIndexes += 1
 }
 const mixedPath = join(dataRoot, 'indexes', `mixed-distance-${distance}.json`)
 const mixedIndex = JSON.parse(await readFile(mixedPath, 'utf8'))
 assert.equal(mixedIndex.distance, distance)
 assert.equal(mixedIndex.refs.length, catalog.mixed[String(distance)].count)
 assert.equal(new Set(mixedIndex.refs.map((ref) => ref.id)).size, mixedIndex.refs.length)
 mixedMemberships += mixedIndex.refs.length
}

const sampleIndex = JSON.parse(await readFile(join(dataRoot, 'indexes', 'tactics-course-2-bishop-fork.json'), 'utf8'))
const sampleRef = sampleIndex.refs[0]
const sampleChunk = JSON.parse(await readFile(join(dataRoot, 'puzzles', `chunk-${String(sampleRef.chunk).padStart(5, '0')}.json`), 'utf8'))
const samplePuzzle = sampleChunk.puzzles.find((puzzle) => puzzle.id === sampleRef.id)
assert.ok(samplePuzzle, 'Named-course canonical reference does not resolve')
assert.ok(samplePuzzle.solution.length >= 1)
assert.ok(samplePuzzle.provenance?.masterGame?.white)
assert.ok(samplePuzzle.provenance?.masterGame?.black)
assert.ok(samplePuzzle.provenance?.historicalMoveSan)

const adapter = await readFile(join(root, 'src/masterTactics/data.ts'), 'utf8')
const page = await readFile(join(root, 'src/masterTactics/MasterTacticsPage.tsx'), 'utf8')
const trainer = await readFile(join(root, 'src/masterTactics/MasterTacticTrainer.tsx'), 'utf8')
const trainerCore = await readFile(join(root, 'src/trainers/patternTactic/PatternTacticTrainer.tsx'), 'utf8')
const router = await readFile(join(root, 'src/AppRouter.tsx'), 'utf8')
const landing = await readFile(join(root, 'src/TacticsPage.tsx'), 'utf8')
const distancePage = await readFile(join(root, 'src/TacticThemeSelectionPage.tsx'), 'utf8')
const regularConfigs = await readFile(join(root, 'src/trainers/patternTactic/pageConfigs.ts'), 'utf8')
const homepage = await readFile(join(root, 'src/trainingCatalog.ts'), 'utf8')
const provenance = await readFile(join(root, 'src/masterPuzzles/MasterProvenanceCard.tsx'), 'utf8')

assert.match(adapter, /mixed-distance-\$\{distance\}\.json/)
assert.match(adapter, /tactics-course-\$\{distance\}-\$\{theme\}\.json/)
assert.match(adapter, /MASTER_TACTIC_CHUNK_SIZE = 30/)
assert.match(adapter, /requestMasterPuzzleData<MasterCanonicalChunk>/)
assert.doesNotMatch(adapter, /puzzles\.json|Promise\.all\([^)]*1612/)
assert.match(adapter, /acceptedEquivalentMovesByUserMove/)
assert.match(adapter, /equivalentOpponentDefenses: puzzle\.equivalentOpponentDefenses/)
assert.match(page, /import MasterTacticsLanding from '\.\/MasterTacticsLanding'/)
assert.match(page, /<MasterTacticsLanding catalog=\{catalog\}/)
assert.match(await readFile(join(root, 'src/masterTactics/MasterTacticsLanding.tsx'), 'utf8'), /<TacticsLandingPage/)
assert.match(page, /TacticThemeSelectionPage/)
assert.match(page, /count > 0|count <= 0/)
assert.match(trainer, /PatternTacticTrainer/)
assert.match(trainer, /trainerKey: `master-tactics:\$\{distance\}:\$\{theme\}`/)
assert.match(trainer, /MasterGamePlayerBar/)
assert.match(trainerCore, /dataSource\?: PatternTacticDataSource/)
assert.match(trainerCore, /isVerifiedEquivalent/)
assert.match(trainerCore, /Correct equivalent — continuing the verified main line/)
assert.match(trainerCore, /renderPuzzleInfo/)
assert.match(trainerCore, /renderBoardPlayerLabels/)
assert.match(router, /path="\/master-tactics\/:distance\/:theme" element=\{<MasterTacticsPage \/>\}/)
assert.match(landing, /export function TacticsLandingPage/)
assert.match(distancePage, /createHierarchyNavigationState/)
assert.match(homepage, /path: '\/master-tactics'/)
assert.doesNotMatch(regularConfigs, /master-tactics|renderBoardPlayerLabels|masterProvenance/)
assert.match(provenance, /solved && provenance\.historicalMoveSan/)
assert.doesNotMatch(provenance, /!solved.*historicalMoveSan/)

const whiteBottom = orientMasterGamePlayers({ white: 'White Player', black: 'Black Player', orientation: 'white' })
assert.equal(whiteBottom.topPlayer.name, 'Black Player')
assert.equal(whiteBottom.bottomPlayer.name, 'White Player')
const blackBottom = orientMasterGamePlayers({ white: 'White Player', black: 'Black Player', orientation: 'black' })
assert.equal(blackBottom.topPlayer.name, 'White Player')
assert.equal(blackBottom.bottomPlayer.name, 'Black Player')

console.log(JSON.stringify({ namedIndexes, namedMemberships, mixedMemberships, totalMemberships: namedMemberships + mixedMemberships, canonicalSample: samplePuzzle.id, result: 'Master Tactics runtime integration contract passed' }))
