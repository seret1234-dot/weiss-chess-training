import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

// Compile only the pure catalog modules; never start a dev-server repository scan.
const result = await build({
  stdin: {
    contents: `export * from './src/trainers/patternTactic/m1toM4LearnerCurriculum'; export { VERIFIED_FINAL_TACTIC_COURSES } from './src/trainers/patternTactic/generatedFinalVerifiedTaxonomy'; export { patternTacticConfigByRoute } from './src/trainers/patternTactic/pageConfigs';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const catalog = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
for (const course of catalog.VERIFIED_FINAL_TACTIC_COURSES) {
  const overlay = catalog.getPatternTacticLearnerCurriculum(course.trainerKey)
  assert.ok(overlay, `${course.trainerKey}: approved course must resolve`)
  assert.equal(overlay.learnerDataBasePath, course.learnerDataBasePath)
  assert.equal(overlay.activeChunkCount, course.chunkCount)
  assert.equal(overlay.unavailableReason, undefined)
  const manifest = JSON.parse(await readFile(`public${overlay.learnerDataBasePath}/manifest.json`, 'utf8'))
  assert.equal(manifest.exerciseCount, course.exerciseCount)
  assert.equal(manifest.chunks.length, overlay.activeChunkCount)
}
assert.equal(catalog.getPatternTacticLearnerCurriculum('unknown-course'), null)
assert.equal(Object.keys(catalog.patternTacticConfigByRoute).length, 76)
for (const [route, config] of Object.entries(catalog.patternTacticConfigByRoute)) {
  assert.ok((config.trainerTitle ?? config.title)?.trim(), `${route}: approved course title exists`)
}
const routeSource = await readFile('src/TacticTrainerRoutePage.tsx', 'utf8')
assert.match(routeSource, /trainerTitle: config\.trainerTitle \?\? config\.title/, 'route adapter forwards the catalog title to the shared trainer')
assert.ok(catalog.getPatternTacticLearnerCurriculum('tactic-advanced-pawn-m1').unavailableReason)
assert.equal(catalog.patternTacticConfigByRoute['m1/advanced-pawn'], undefined)
console.log('PASS: all 76 approved focused Tactic courses resolve; unavailable courses remain fail-closed')
