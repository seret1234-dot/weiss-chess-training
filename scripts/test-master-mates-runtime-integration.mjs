import assert from 'node:assert/strict'
import { orientMasterGamePlayers } from '../src/components/chess/masterGamePlayerLabels.mjs'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const indexesDir = join(root, 'public/data/master-puzzles/v1/indexes')
const catalog = JSON.parse(await readFile(join(indexesDir, 'mates-theme-catalog.json'), 'utf8'))
const distances = [1, 2, 3, 4]
const themes = [...catalog.primaryOrder, 'mixed']
const expectedTotals = { 1: 1987, 2: 2261, 3: 2196, 4: 6410 }
const expectedMixedVirtualChunks = { 1: 62, 2: 67, 3: 63, 4: 180 }

let allIds = new Set()
let named = 0
let mixed = 0
let killBox = 0
for (const distance of distances) {
 let distanceTotal = 0
 for (const theme of themes) {
  const name = `mates-theme-${distance}-${theme}.json`
  const path = join(indexesDir, name)
  assert.ok(existsSync(path), `Missing Master Mate route index ${name}`)
  const index = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(index.distance, distance, `${name} distance mismatch`)
  assert.equal(index.theme, theme, `${name} theme mismatch`)
  assert.ok(Array.isArray(index.refs), `${name} must have refs`)
  const virtualChunks = []
  for (let start = 0; start < index.refs.length; start += 30) virtualChunks.push(index.refs.slice(start, start + 30))
  assert.equal(virtualChunks.length, Math.ceil(index.refs.length / 30), `${name} has the exact 30-puzzle virtual chunk count`)
  assert.deepEqual(virtualChunks.flat(), index.refs, `${name} first/middle/final virtual chunks reconcile to the ordered index exactly once`)
  assert.ok(virtualChunks.every((chunk) => chunk.length > 0 && chunk.length <= 30), `${name} has bounded virtual chunks`)
  if (theme === 'mixed') assert.equal(virtualChunks.length, expectedMixedVirtualChunks[distance], `${name} has the approved uncapped Mixed chunk count`)
  distanceTotal += index.refs.length
  for (const ref of index.refs) {
   assert.ok(!allIds.has(ref.id), `Duplicate primary Master Mate ${ref.id}`)
   allIds.add(ref.id)
   assert.ok(Number.isInteger(ref.chunk) && ref.chunk >= 0, `Invalid canonical chunk for ${ref.id}`)
  }
  if (theme === 'mixed') mixed += index.refs.length
  else named += index.refs.length
  if (theme.startsWith('kill-box-')) killBox += index.refs.length
 }
 assert.equal(distanceTotal, expectedTotals[distance], `Master Mate distance ${distance} mismatch`)
}
assert.equal(allIds.size, 12854)
assert.equal(named, 1754)
assert.equal(killBox, 1468)
assert.equal(mixed, 11100)

const data = await readFile(join(root, 'src/masterPuzzles/dataSource.ts'), 'utf8')
const regularPageConfigs = await readFile(join(root, 'src/trainers/patternMate/pageConfigs.ts'), 'utf8')
const adapter = await readFile(join(root, 'src/masterMates/data.ts'), 'utf8')
const page = await readFile(join(root, 'src/masterMates/MasterMatesPage.tsx'), 'utf8')
const trainer = await readFile(join(root, 'src/masterMates/MasterMateTrainer.tsx'), 'utf8')
const provenance = await readFile(join(root, 'src/masterMates/MasterMateProvenanceCard.tsx'), 'utf8')
const sharedProvenance = await readFile(join(root, 'src/masterPuzzles/MasterProvenanceCard.tsx'), 'utf8')
const trainerCore = await readFile(join(root, 'src/trainers/patternMate/PatternMateTrainer.tsx'), 'utf8')
const router = await readFile(join(root, 'src/AppRouter.tsx'), 'utf8')
const regularDistance = await readFile(join(root, 'src/MateDistancePage.tsx'), 'utf8')
const masterTactics = await readFile(join(root, 'src/masterPuzzles/MasterPuzzlesPage.tsx'), 'utf8')

assert.match(data, /VITE_MASTER_PUZZLES_BASE_URL/)
assert.match(data, /LOCAL_MASTER_PUZZLES_BASE_URL/)
assert.match(adapter, /mates-theme-\$\{distance\}-\$\{theme\}\.json/)
assert.match(adapter, /puzzles\/chunk-\$\{String\(chunk\)\.padStart\(5, '0'\)\}\.json/)
assert.doesNotMatch(adapter, /catalog\.json.*puzzles|puzzles\.json/)
assert.match(adapter, /MASTER_MATE_CHUNK_SIZE = 30/)
assert.match(adapter, /refs\.slice\(start, start \+ MASTER_MATE_CHUNK_SIZE\)/)
assert.match(adapter, /\[\.\.\.new Set\(group\.refs\.map\(\(ref\) => ref\.chunk\)\)\]/, 'selected Master Mate groups load only their required canonical shards')
assert.match(adapter, /acceptedEquivalentMovesByUserMove/)
assert.match(adapter, /masterProvenance/)
assert.match(page, /import MasterMatesLanding from '\.\/MasterMatesLanding'/)
assert.match(page, /<MasterMatesLanding catalog=\{catalog\}/)
assert.match(await readFile(join(root, 'src/masterMates/MasterMatesLanding.tsx'), 'utf8'), /<MateLandingPage/)
assert.match(page, /MateThemeSelectionPage/)
assert.match(page, /rawTheme === 'kill-box'/)
assert.match(page, /\['kill-box-adjacent-rook', 'kill-box-rook-rail', 'kill-box-queen-fence'\]/)
assert.match(page, /catalog\.primaryOrder, 'mixed'/)
assert.match(trainer, /trainerKey: `master-mates:\$\{distance\}:\$\{theme\}`/)
assert.match(trainer, /MasterMateProvenanceCard/)
assert.match(provenance, /MasterProvenanceCard/)
assert.match(sharedProvenance, /historicalMoveSan/)
const whiteBottom = orientMasterGamePlayers({ white: 'White Player', black: 'Black Player', orientation: 'white' })
assert.equal(whiteBottom.topPlayer.name, 'Black Player')
assert.equal(whiteBottom.bottomPlayer.name, 'White Player')
const blackBottom = orientMasterGamePlayers({ white: 'White Player', black: 'Black Player', orientation: 'black' })
assert.equal(blackBottom.topPlayer.name, 'White Player')
assert.equal(blackBottom.bottomPlayer.name, 'Black Player')
assert.match(trainer, /renderBoardPlayerLabels/)
assert.match(trainer, /white: String\(game\.white/)
assert.match(trainer, /black: String\(game\.black/)
assert.match(trainer, /orientation,/)
assert.match(trainer, /MasterGamePlayerBar player=\{players\.topPlayer\}/)
assert.match(trainer, /MasterGamePlayerBar player=\{players\.bottomPlayer\}/)
assert.doesNotMatch(regularPageConfigs, /renderBoardPlayerLabels/)
assert.match(sharedProvenance, /Root FEN/)
assert.match(sharedProvenance, /You play/)
assert.match(trainerCore, /dataSource\?: PatternMateDataSource/)
assert.match(trainerCore, /renderPuzzleInfo/)
assert.match(trainerCore, /isVerifiedEquivalent/)
assert.match(router, /path="\/master-mates" element=\{<MasterMatesPage \/>\}/)
assert.match(router, /path="\/master-mates\/:distance\/:theme" element=\{<MasterMatesPage \/>\}/)
assert.match(regularDistance, /parentHref="\/mates"/)
assert.doesNotMatch(masterTactics, /masterMates\/|MasterMatesPage/)

console.log(JSON.stringify({
 total: allIds.size,
 distances: expectedTotals,
 named,
 killBox,
 mixed,
 routeIndexes: distances.length * themes.length,
 result: 'Master Mates remote runtime integration contract passed',
}))
