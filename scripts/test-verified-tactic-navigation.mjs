import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const activationMinimum = 20
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })

try {
  const taxonomy = await vite.ssrLoadModule('/src/trainers/patternTactic/generatedFinalVerifiedTaxonomy.ts')
  const navigation = await vite.ssrLoadModule('/src/tacticThemeCatalog.ts')
  const pageConfigs = await vite.ssrLoadModule('/src/trainers/patternTactic/pageConfigs.ts')
  const trainerCatalog = await vite.ssrLoadModule('/src/training/trainerCatalog.ts')
  const curriculum = await vite.ssrLoadModule('/src/training/curriculum/curriculumCatalog.ts')

  const activeCourses = taxonomy.VERIFIED_FINAL_TACTIC_COURSES
  const expectedRoutes = new Set(activeCourses.map((course) => `/tactics/m${course.stage}/${course.theme}`))
  const expectedRouteKeys = new Set(activeCourses.map((course) => `m${course.stage}/${course.theme}`))
  const visibleRoutes = navigation.tacticThemeCatalog.flatMap((theme) =>
    theme.distances.map((distance) => `/tactics/${distance}/${theme.slug}`),
  )

  assert.equal(activeCourses.length, 76, 'final taxonomy active course count')
  assert.equal(visibleRoutes.length, 76, 'one learner-visible course link per final active course')
  assert.equal(new Set(visibleRoutes).size, visibleRoutes.length, 'learner-visible course links are unique')
  assert.deepEqual(new Set(visibleRoutes), expectedRoutes, 'visible course links exactly match final active taxonomy')
  assert.deepEqual(new Set(Object.keys(pageConfigs.patternTacticConfigByRoute)), expectedRouteKeys, 'only active routes can mount a tactic board')

  const stages = Object.fromEntries([1, 2, 3, 4].map((stage) => [
    `M${stage}`,
    visibleRoutes.filter((route) => route.startsWith(`/tactics/m${stage}/`)).length,
  ]))
  assert.deepEqual(stages, { M1: 25, M2: 13, M3: 19, M4: 19 }, 'visible links by stage')

  for (const course of activeCourses) {
    const routeKey = `m${course.stage}/${course.theme}`
    const config = pageConfigs.patternTacticConfigByRoute[routeKey]
    assert.ok(config, `active route config required: ${routeKey}`)
    assert.equal(config.trainerKey, course.trainerKey, `active route trainer key: ${routeKey}`)
    assert.equal(config.manifestPath, `${course.learnerDataBasePath}/manifest.json`, `active route manifest: ${routeKey}`)
    assert.ok(course.exerciseCount >= activationMinimum, `activation minimum: ${routeKey}`)
    const manifestFile = path.join(root, 'public', config.manifestPath.replace(/^\//, ''))
    assert.ok(fs.existsSync(manifestFile), `active manifest exists: ${routeKey}`)
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    assert.equal(manifest.exerciseCount, course.exerciseCount, `approved manifest count: ${routeKey}`)
    assert.ok(manifest.exerciseCount >= activationMinimum, `approved manifest activation minimum: ${routeKey}`)
  }

  const catalogTactics = trainerCatalog.TRAINER_CATALOG.filter((trainer) => trainer.category === 'tactics')
  const autoTactics = trainerCatalog.AUTO_TRAINERS.filter((trainer) => trainer.category === 'tactics')
  const curriculumTactics = curriculum.getCurriculumItems('tactics')
  assert.deepEqual(new Set(catalogTactics.map((trainer) => trainer.route)), expectedRoutes, 'course registry matches final active taxonomy')
  assert.deepEqual(new Set(autoTactics.map((trainer) => trainer.route)), expectedRoutes, 'auto-training selectors match final active taxonomy')
  assert.deepEqual(new Set(curriculumTactics.map((item) => item.route)), expectedRoutes, 'curriculum recommendations match final active taxonomy')

  const unavailableRoutes = [
    '/tactics/m1/defense',
    '/tactics/m1/advanced-pawn',
    '/tactics/m1/quiet-move',
    '/tactics/m1/queen-xray',
    '/tactics/m1/rook-xray',
    '/tactics/m1/bishop-xray',
    '/tactics/m1/trapped-piece',
    '/tactics/m1/overload',
    '/tactics/m1/decoy-attraction',
    '/tactics/m1/interference',
    '/tactics/m1/clearance',
  ]
  for (const route of unavailableRoutes) {
    const routeKey = route.replace('/tactics/', '')
    assert.ok(!visibleRoutes.includes(route), `unavailable route is not learner-visible: ${route}`)
    assert.ok(!pageConfigs.patternTacticConfigByRoute[routeKey], `unavailable route cannot mount a board: ${route}`)
    assert.ok(!catalogTactics.some((trainer) => trainer.route === route), `unavailable route absent from registry: ${route}`)
  }

  for (const unavailable of taxonomy.VERIFIED_FINAL_TACTIC_UNAVAILABLE) {
    assert.ok(!visibleRoutes.some((route) => route.endsWith(`/${unavailable.theme}`)), `final taxonomy ${unavailable.status} theme is not learner-visible: ${unavailable.theme}`)
    assert.ok(!Object.keys(pageConfigs.patternTacticConfigByRoute).some((route) => route.endsWith(`/${unavailable.theme}`)), `final taxonomy ${unavailable.status} theme cannot mount a board: ${unavailable.theme}`)
    assert.ok(!catalogTactics.some((trainer) => trainer.route.endsWith(`/${unavailable.theme}`)), `final taxonomy ${unavailable.status} theme is absent from registry: ${unavailable.theme}`)
  }

  console.log(JSON.stringify({
    passed: true,
    activeCourses: activeCourses.length,
    clickableCourseLinks: visibleRoutes.length,
    stages,
    activationMinimum,
    unavailableRoutesVerified: unavailableRoutes.length + taxonomy.VERIFIED_FINAL_TACTIC_UNAVAILABLE.length,
  }, null, 2))
} finally {
  await vite.close()
}
