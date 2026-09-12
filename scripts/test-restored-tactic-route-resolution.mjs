import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

// Compile only the pure catalog modules; never start a dev-server repository scan.
const result = await build({
  stdin: {
    contents: `export * from './src/trainers/patternTactic/m1toM4LearnerCurriculum'; export * from './src/trainers/fullChunkCurriculumCatalog'; export { patternTacticConfigByRoute } from './src/trainers/patternTactic/pageConfigs';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const catalog = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
let checked = 0
for (const course of catalog.FULL_PATTERN_TACTIC_COURSES) {
  if (course.theme === 'mixed') continue // Mixed uses its own existing loader.
  const overlay = catalog.getPatternTacticLearnerCurriculum(course.trainerKey)
  assert.ok(overlay, `${course.trainerKey}: existing restored course must resolve`)
  assert.equal(overlay.learnerDataBasePath, course.dataBasePath)
  assert.equal(overlay.activeChunkCount, course.chunkCount)
  assert.equal(overlay.unavailableReason, undefined)
  checked += 1
}
for (const [theme, count] of [['king-fork', 40], ['vulnerable-king', 300]]) {
  const overlay = catalog.getPatternTacticLearnerCurriculum(`tactic-${theme}-m2`)
  const manifest = JSON.parse(await readFile(`public${overlay.learnerDataBasePath}/manifest.json`, 'utf8'))
  assert.equal(manifest.totalPuzzles, count)
  assert.equal(manifest.totalChunks, overlay.activeChunkCount)
}
assert.equal(catalog.getPatternTacticLearnerCurriculum('unknown-course'), null)
assert.equal(Object.keys(catalog.patternTacticConfigByRoute).length, 188)
for (const [route, config] of Object.entries(catalog.patternTacticConfigByRoute)) {
  assert.ok((config.trainerTitle ?? config.title)?.trim(), `${route}: approved course title exists`)
}
const routeSource = await readFile('src/TacticTrainerRoutePage.tsx', 'utf8')
assert.match(routeSource, /trainerTitle: config\.trainerTitle \?\? config\.title/, 'route adapter forwards the catalog title to the shared trainer')
assert.ok(catalog.getPatternTacticLearnerCurriculum('tactic-file-clearance-m1').unavailableReason)
console.log(`PASS: ${checked} existing restored focused Tactic courses resolve; unavailable courses remain fail-closed`)
