import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)
require.extensions['.ts'] = (module, filename) => {
 const source = readFileSync(filename, 'utf8')
 const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText
 module._compile(compiled, filename)
}

const root = process.cwd()
const { siteExplanations } = require(join(root, 'src/content/siteExplanations.ts'))
const {
 MATE_THEME_EXPLANATION_KEYS,
 TACTIC_THEME_EXPLANATION_KEYS,
 resolveMateExplanationKey,
 resolveTacticExplanationKey,
} = require(join(root, 'src/content/trainerExplanationKeys.ts'))
const {
 patternMatePageConfigs,
 getKillBoxSubpatternPageConfig,
} = require(join(root, 'src/trainers/patternMate/pageConfigs.ts'))
const { patternTacticConfigByRoute } = require(join(root, 'src/trainers/patternTactic/pageConfigs.ts'))

const assertExistingKey = (key, context) => {
 assert.ok(key, `${context} must resolve an explanation key`)
 assert.ok(siteExplanations[key], `${context} references missing explanation ${key}`)
}

for (const [theme, key] of Object.entries(MATE_THEME_EXPLANATION_KEYS)) {
 assertExistingKey(key, `Mate theme ${theme}`)
 assert.equal(resolveMateExplanationKey(theme), key)
}
for (const [theme, key] of Object.entries(TACTIC_THEME_EXPLANATION_KEYS)) {
 assertExistingKey(key, `Tactic theme ${theme}`)
 assert.equal(resolveTacticExplanationKey(theme), key)
}

const ignoredLegacyMateConfigs = new Set(['bishopKnightMate', 'twoBishopsMate'])
const activeRegularMateConfigs = Object.entries(patternMatePageConfigs)
 .filter(([configKey]) => !ignoredLegacyMateConfigs.has(configKey))
assert.equal(activeRegularMateConfigs.length, 41)
for (const [configKey, config] of activeRegularMateConfigs) {
 assertExistingKey(config.explanationKey, `Pattern Mate config ${configKey}`)
}
assert.equal(patternMatePageConfigs.bodenMate1.explanationKey, resolveMateExplanationKey('boden'))
assert.equal(patternMatePageConfigs.bodenMate2.explanationKey, resolveMateExplanationKey('boden'))
assert.equal(patternMatePageConfigs.bodenMate3.explanationKey, resolveMateExplanationKey('boden'))

const killBoxSubpatterns = ['adjacent-rook', 'rook-rail', 'queen-fence']
let regularKillBoxCourses = 0
for (const distance of [1, 2, 3, 4, 5]) {
 for (const subpattern of killBoxSubpatterns) {
  const config = getKillBoxSubpatternPageConfig(subpattern, distance)
  assertExistingKey(config.explanationKey, `Kill Box ${subpattern} M${distance}`)
  assert.equal(config.explanationKey, resolveMateExplanationKey(`kill-box-${subpattern}`))
  regularKillBoxCourses += 1
 }
}
assert.equal(regularKillBoxCourses, 15)

const tacticRoutes = Object.entries(patternTacticConfigByRoute)
assert.equal(tacticRoutes.length, 188)
for (const [route, config] of tacticRoutes) {
 const theme = route.split('/')[1]
 assertExistingKey(config.explanationKey, `Pattern Tactic route ${route}`)
 assert.equal(config.explanationKey, resolveTacticExplanationKey(theme), `${route} must use the shared resolver`)
}

const mateCatalog = JSON.parse(readFileSync(join(root, 'public/data/master-puzzles/v1/indexes/mates-theme-catalog.json'), 'utf8'))
let masterMateCourses = 0
for (const [distance, counts] of Object.entries(mateCatalog.distances)) {
 for (const [theme, count] of Object.entries(counts)) {
  if (Number(count) <= 0) continue
  assertExistingKey(resolveMateExplanationKey(theme), `Master Mate ${distance}:${theme}`)
  masterMateCourses += 1
 }
}
assert.equal(masterMateCourses, 45)

const masterCatalog = JSON.parse(readFileSync(join(root, 'public/data/master-puzzles/v1/catalog.json'), 'utf8'))
let masterTacticCourses = 0
for (const [distance, details] of Object.entries(masterCatalog.tactics)) {
 for (const [theme, count] of Object.entries(details.themes)) {
  if (Number(count) <= 0) continue
  assertExistingKey(resolveTacticExplanationKey(theme), `Master Tactic ${distance}:${theme}`)
  masterTacticCourses += 1
 }
 if (Number(masterCatalog.mixed[distance]?.count) > 0) {
  assertExistingKey(resolveTacticExplanationKey('mixed'), `Master Tactic ${distance}:mixed`)
  masterTacticCourses += 1
 }
}
assert.equal(masterTacticCourses, 55)

const masterMateTrainer = readFileSync(join(root, 'src/masterMates/MasterMateTrainer.tsx'), 'utf8')
const masterTacticTrainer = readFileSync(join(root, 'src/masterTactics/MasterTacticTrainer.tsx'), 'utf8')
const patternMateTrainer = readFileSync(join(root, 'src/trainers/patternMate/PatternMateTrainer.tsx'), 'utf8')
const patternTacticTrainer = readFileSync(join(root, 'src/trainers/patternTactic/PatternTacticTrainer.tsx'), 'utf8')
assert.match(masterMateTrainer, /resolveMateExplanationKey\(theme\)/)
assert.match(masterMateTrainer, /explanationKey,/)
assert.match(masterTacticTrainer, /resolveTacticExplanationKey\(theme\)/)
assert.match(masterTacticTrainer, /explanationKey,/)
assert.match(patternMateTrainer, /siteExplanations\[config\.explanationKey\]/)
assert.match(patternMateTrainer, /SiteExplanationBox explanation=\{trainerExplanation\}/)
assert.match(patternTacticTrainer, /siteExplanations\[config\.explanationKey\]/)
assert.match(patternTacticTrainer, /SiteExplanationBox explanation=\{trainerExplanation\}/)

const resolvedTrainerKeys = new Set([
 ...Object.values(MATE_THEME_EXPLANATION_KEYS),
 ...Object.values(TACTIC_THEME_EXPLANATION_KEYS),
 ...activeRegularMateConfigs.map(([, config]) => config.explanationKey),
])
const trainerSpecificRegistryKeys = Object.keys(siteExplanations).filter((key) =>
 (key.startsWith('tactic') && key !== 'tactics')
 || key.endsWith('Mate')
 || key === 'stalemateUnderpromotion',
)
for (const key of trainerSpecificRegistryKeys) {
 assert.ok(resolvedTrainerKeys.has(key), `Trainer-specific explanation ${key} must not be orphaned`)
}

assert.equal(siteExplanations.anastasiaMate.title, "Anastasia's Mate")
assert.equal(siteExplanations.bodenMate.title, "Boden's Mate")
assert.equal(siteExplanations.tacticRemoveDefender.title, 'Removing the Defender')
assert.equal(siteExplanations.tacticZwischencheck.title, 'Zwischencheck')
assert.equal(patternMatePageConfigs.anastasiaMate1.title, "Anastasia's Mate in 1")
assert.equal(patternMatePageConfigs.bodenMate1.title, "Boden's Mate in 1")
assert.equal(patternTacticConfigByRoute['m1/remove-the-defender'].title, 'Removing the Defender - Tactic in 1')
assert.match(siteExplanations.hookMate.concept, /rook gives mate beside the king/i)
assert.match(siteExplanations.dovetailMate.concept, /diagonally adjacent/i)
assert.match(siteExplanations.killBoxMate.concept, /queen and rook/i)

for (const [theme, expectedKey] of [
 ['rook-pin', 'tacticPin'],
 ['queen-skewer', 'tacticSkewer'],
 ['deflection', 'tacticDeflection'],
 ['remove-the-defender', 'tacticRemoveDefender'],
 ['discovered-attack', 'tacticDiscoveredAttack'],
 ['zwischencheck', 'tacticZwischencheck'],
 ['zugzwang', 'tacticZugzwang'],
]) {
 assert.equal(resolveTacticExplanationKey(theme), expectedKey)
}

for (const [mateTheme, tacticTheme] of [
 ['mixed', 'mixed'],
]) {
 assertExistingKey(resolveMateExplanationKey(mateTheme), `regular/Master Mate ${mateTheme}`)
 assertExistingKey(resolveTacticExplanationKey(tacticTheme), `regular/Master Tactic ${tacticTheme}`)
}

console.log(JSON.stringify({
 activeRegularMateConfigs: activeRegularMateConfigs.length + regularKillBoxCourses,
 patternTacticRoutes: tacticRoutes.length,
 masterMateCourses,
 masterTacticCourses,
 activeTrainersWithoutExplanation: 0,
 missingRegistryKeys: 0,
 unexpectedTrainerSpecificOrphans: 0,
}, null, 2))
console.log('Trainer explanation coverage test passed.')
