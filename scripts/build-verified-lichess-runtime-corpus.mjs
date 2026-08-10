import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Chess } from 'chess.js'

const root = process.cwd()
const local = path.join(root, '.local-verified-lichess-tactics-v1')
const runtimeVersion = 'final-v6'
const runtimePath = `/data/verified-lichess-tactics-v1/${runtimeVersion}`
const output = path.join(root, 'public', 'data', 'verified-lichess-tactics-v1', runtimeVersion)
const taxonomyModule = path.join(root, 'src', 'trainers', 'patternTactic', 'generatedFinalVerifiedTaxonomy.ts')
const replace = process.argv.includes('--replace')
const sources = [
  'candidate-corpus-v1',
  'b2-v5-candidate-corpus-v1',
  'hanging-m1-candidate-corpus-v1',
  'core-candidate-corpora-v4',
  'm3-m4-candidate-corpora-v1',
  'clearance-sacrifice-m2-candidate-corpus-v1',
].map(name => path.join(local, name))
const sha = value => crypto.createHash('sha256').update(value).digest('hex')
const normalize = value => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const routeTheme = label => ({
  'removal-of-defender-by-capture': 'remove-the-defender',
  'file-clearance': 'file-clearance',
  'rank-clearance': 'rank-clearance',
  'diagonal-clearance': 'diagonal-clearance',
  'capture-zwischenzug-m1': 'zwischenzug',
  'capture-zwischenzug': 'zwischenzug',
  'zwischencheck-m1': 'zwischencheck',
  zwischencheck: 'zwischencheck',
}[normalize(label)] || normalize(label))
const canonicalLabel = label => ({
  'capture-zwischenzug-m1': 'Capture Zwischenzug',
  'zwischencheck-m1': 'Zwischencheck',
}[normalize(label)] || label)
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(file) : entry.name.endsWith('.json') && !['manifest.json', 'index.json', 'integrity.json'].includes(entry.name) ? [file] : []
  })
}
function recordsFrom(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  return Array.isArray(json.exercises) ? json.exercises : Array.isArray(json.records) ? json.records : []
}
function sourceLine(record) {
  if (Array.isArray(record.solution)) return record.solution
  if (Array.isArray(record.completeMoveSequence)) return record.completeMoveSequence
  if (Array.isArray(record.completeLegalLine)) return record.completeLegalLine.slice(1)
  if (record.learnerMove) return [record.learnerMove]
  throw Error(`missing verified solution line for ${record.sourcePuzzleId || record.lichessPuzzleId || record.id}`)
}
function positionKey(fen) {
 return String(fen).trim().split(/\s+/).slice(0, 4).join(' ')
}
function moveFromUci(uci) {
 return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }
}
function stageOf(record) {
  const value = String(record.stage || record.learnerStage || '')
  if (value === 'TRUE_M4' || value === 'M4') return 'M4'
  if (value === 'TRUE_M3' || value === 'M3') return 'M3'
  if (value === 'TRUE_M2' || value === 'M2') return 'M2'
  return 'M1'
}
function labelOf(record) {
  return record.course || record.canonicalTheme || record.canonicalThemeLabel || record.label || record.theme || 'Verified tactic'
}
function sourcePuzzleIdOf(record) {
 return record.sourcePuzzleId || record.lichessPuzzleId
}
function userMoveIndexesFor(stage) {
 const count = Number(stage.slice(1))
 return Array.from({ length: count }, (_, index) => index * 2)
}
function assertLegalRuntimeLine({ sourcePuzzleId, displayedFen, solutionLine, userMoveIndexes }) {
 if (!solutionLine.length || userMoveIndexes.at(-1) == null || userMoveIndexes.at(-1) >= solutionLine.length) {
  throw Error(`Incomplete learner sequence for ${sourcePuzzleId}`)
 }
 const game = new Chess(displayedFen)
 for (const uci of solutionLine) {
  const move = game.move(moveFromUci(uci))
  if (!move) throw Error(`Illegal runtime replay ${sourcePuzzleId} ${uci}`)
 }
}
function validatePremoveContext(sourcePuzzleId, context) {
 if (!context?.sourceFen || !context?.preMove || !context?.displayedFen) {
  throw Error(`Missing embedded premove provenance for ${sourcePuzzleId}`)
 }
 const premoveGame = new Chess(context.sourceFen)
 const appliedPremove = premoveGame.move(moveFromUci(context.preMove))
 if (!appliedPremove || positionKey(premoveGame.fen()) !== positionKey(context.displayedFen)) {
  throw Error(`Invalid embedded premove provenance for ${sourcePuzzleId}`)
 }
 return { sourceFen: context.sourceFen, preMove: context.preMove, displayedFen: context.displayedFen }
}
function loadEmbeddedPremoveContextsFromFinalV5() {
 const legacyRoot = path.join(root, 'public', 'data', 'verified-lichess-tactics-v1', 'final-v5')
 const indexPath = path.join(legacyRoot, 'index.json')
 if (!fs.existsSync(indexPath)) throw Error(`Missing verified premove source corpus: ${indexPath}`)
 const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
 const contexts = new Map()
 for (const course of index.courses || []) {
  if (course.theme === 'mixed') continue
  const manifestPath = path.join(legacyRoot, `${course.theme}-${String(course.stage).toLowerCase()}`, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  for (const chunk of manifest.chunks || []) {
   const payload = JSON.parse(fs.readFileSync(path.join(path.dirname(manifestPath), chunk.file), 'utf8'))
   for (const exercise of payload.exercises || []) {
    const sourcePuzzleId = exercise.sourcePuzzleId
    if (!sourcePuzzleId || contexts.has(sourcePuzzleId)) continue
    contexts.set(sourcePuzzleId, validatePremoveContext(sourcePuzzleId, exercise))
   }
  }
 }
 return contexts
}
function readVerifiedPremoveContexts(rawRecords) {
 const contexts = loadEmbeddedPremoveContextsFromFinalV5()
 for (const record of rawRecords) {
  const sourcePuzzleId = sourcePuzzleIdOf(record)
  if (!sourcePuzzleId) throw Error('Missing source puzzle ID while reading premove provenance')
  const own = record.sourceFen && record.preMove && record.displayedFen
   ? validatePremoveContext(sourcePuzzleId, record)
   : null
  const inherited = contexts.get(sourcePuzzleId)
  if (own && inherited && (
   positionKey(own.sourceFen) !== positionKey(inherited.sourceFen) ||
   own.preMove !== inherited.preMove ||
   positionKey(own.displayedFen) !== positionKey(inherited.displayedFen)
  )) throw Error(`Conflicting embedded premove provenance for ${sourcePuzzleId}`)
  if (own) contexts.set(sourcePuzzleId, own)
 }
 const missing = rawRecords.map(sourcePuzzleIdOf).filter((sourcePuzzleId) => !contexts.has(sourcePuzzleId))
 if (missing.length) throw Error(`Missing embedded premove provenance for ${missing.length} accepted runtime exercises: ${missing.slice(0, 10).join(', ')}`)
 return contexts
}
function converted(record, premoveContext) {
  const label = canonicalLabel(labelOf(record))
  const stage = stageOf(record)
  const solutionLine = sourceLine(record)
 const sourcePuzzleId = sourcePuzzleIdOf(record)
 const exerciseId = record.exerciseId || record.id
 const sourceFen = String(premoveContext?.sourceFen || '')
 const displayedFen = String(premoveContext?.displayedFen || '')
 const preMove = String(premoveContext?.preMove || '')
 if (!sourcePuzzleId || !exerciseId || !sourceFen || !displayedFen || !preMove) {
  throw Error(`incomplete verified premove provenance for ${sourcePuzzleId || exerciseId || 'unknown record'}`)
 }
 const premoveGame = new Chess(sourceFen)
 const appliedPremove = premoveGame.move(moveFromUci(preMove))
 if (!appliedPremove || positionKey(premoveGame.fen()) !== positionKey(displayedFen)) {
  throw Error(`invalid verified premove provenance for ${sourcePuzzleId}`)
 }
 const userMoveIndexes = userMoveIndexesFor(stage)
 assertLegalRuntimeLine({ sourcePuzzleId, displayedFen, solutionLine, userMoveIndexes })
 return {
    id: exerciseId,
    exerciseId,
    sourcePuzzleId,
    // The public exercise is self-contained: sourceFen plus preMove is the
    // canonical, verified pre-display transition. This intentionally avoids a
    // runtime-global sidecar that can be omitted from a deployment artifact.
    fen: displayedFen,
    displayedFen,
    sourceFen,
    preMove,
    preMoveSideToMove: premoveGame.turn(),
    solutionLine,
    userMoveIndexes,
    theme: label,
    label,
    canonicalThemeKey: routeTheme(label),
    canonicalThemeLabel: label,
    canonicalSubtype: record.canonicalSubtype || null,
    stage,
    rating: record.rating ?? null,
    exactSymmetryFamilyId: record.exactSymmetryFamilyId ?? null,
    canonicalIdentity: record.canonicalIdentity ?? null,
    structuralValidation: record.structuralValidation ?? record.structuralResult?.status ?? 'STRUCTURALLY_VERIFIED',
    engineValidation: record.engineValidation ?? record.engineComparison ?? { outcome: 'APPROVED' },
    provenance: {
      corpus: `verified-lichess-${runtimeVersion}`,
      originalExerciseId: exerciseId,
      premoveContext: 'embedded-v1',
      sourcePuzzleId,
    },
  }
}
if (fs.existsSync(output)) {
 if (!replace) throw Error(`refusing to overwrite existing runtime corpus: ${output}`)
 // Runtime corpora are source-controlled public assets on Windows. Replace
 // their deterministic files in place rather than removing the directory so
 // an editor, watcher, or deployment snapshot cannot observe a missing corpus.
}
const groups = new Map()
const sourceIds = new Set()
const rawRecords = []
for (const source of sources) for (const file of walk(source)) for (const raw of recordsFrom(file)) {
  const sourcePuzzleId = sourcePuzzleIdOf(raw)
  if (!sourcePuzzleId) throw Error(`Missing source puzzle ID in ${file}`)
  if (sourceIds.has(sourcePuzzleId)) throw Error(`cross-course duplicate source ID: ${sourcePuzzleId}`)
  sourceIds.add(sourcePuzzleId)
  rawRecords.push(raw)
}
const premoveContexts = readVerifiedPremoveContexts(rawRecords)
for (const raw of rawRecords) {
  const record = converted(raw, premoveContexts.get(sourcePuzzleIdOf(raw)))
  const key = `${record.canonicalThemeKey}|${record.stage}`
  ;(groups.get(key) ?? groups.set(key, []).get(key)).push(record)
}
const unavailableCourses = [
 { theme: 'bishop-xray', label: 'Bishop X-Ray', status: 'metadata-only', reason: 'No approved runtime corpus is available.' },
 { theme: 'queen-xray', label: 'Queen X-Ray', status: 'metadata-only', reason: 'No approved runtime corpus is available.' },
 { theme: 'rook-xray', label: 'Rook X-Ray', status: 'metadata-only', reason: 'No approved runtime corpus is available.' },
 { theme: 'trapped-piece', label: 'Trapped Piece', status: 'unavailable', reason: 'No approved runtime corpus is available.' },
 { theme: 'overload', label: 'Overload', status: 'unavailable', reason: 'No approved runtime corpus is available.' },
 { theme: 'square-clearance', label: 'Square Clearance', status: 'unavailable', reason: 'Two fail-closed attempts produced no strict TRUE M2 candidates.' },
]
const index = {
 version: `verified-lichess-final-runtime-${runtimeVersion}`,
 totalExercises: sourceIds.size,
 courses: [],
 taxonomy: { source: 'verified-lichess-final-taxonomy-status-matrix-v1', active: [], unavailable: unavailableCourses },
}
const mixedRecords = new Map([['M1', []], ['M2', []], ['M3', []], ['M4', []]])
for (const [key, records] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  const [theme, stage] = key.split('|')
  const directory = path.join(output, `${theme}-${stage.toLowerCase()}`)
  fs.mkdirSync(directory, { recursive: true })
  const chunks = []
  for (let offset = 0; offset < records.length; offset += 20) {
    const file = `chunk-${String(chunks.length + 1).padStart(2, '0')}.json`
    const exercises = records.slice(offset, offset + 20)
    fs.writeFileSync(path.join(directory, file), `${JSON.stringify({ schemaVersion: 1, theme, stage, chunk: chunks.length + 1, exercises }, null, 2)}\n`)
    chunks.push({ file, count: exercises.length })
  }
  const manifest = { schemaVersion: 1, corpus: `verified-lichess-final-runtime-${runtimeVersion}`, theme, stage, canonicalThemeLabels: [...new Set(records.map(record => record.canonicalThemeLabel))].sort(), exerciseCount: records.length, chunks, sha256: sha(JSON.stringify(records)), validation: { structural: 'approved final candidate corpus', engine: 'individually approved where required', sourceIdsUnique: true } }
  fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  mixedRecords.get(stage).push(...records)
  const course = { theme, stage, exerciseCount: records.length, chunkCount: chunks.length, path: `${runtimePath}/${theme}-${stage.toLowerCase()}`, sha256: manifest.sha256, label: records[0].canonicalThemeLabel }
  index.courses.push(course)
  index.taxonomy.active.push({ ...course, trainerKey: `tactic-${theme}-${stage.toLowerCase()}` })
}
for (const stage of ['M1', 'M2', 'M3', 'M4']) {
  const records = mixedRecords.get(stage)
  const directory = path.join(output, `mixed-${stage.toLowerCase()}`)
  fs.mkdirSync(directory, { recursive: true })
  const file = 'chunk-01.json'
  fs.writeFileSync(path.join(directory, file), `${JSON.stringify({ schemaVersion: 1, theme: 'mixed', stage, exercises: records }, null, 2)}\n`)
  const sources = [...new Set(records.map(record => record.canonicalThemeKey))].sort()
  const manifest = { schemaVersion: 1, corpus: `verified-lichess-final-runtime-${runtimeVersion}`, theme: 'mixed', stage, exerciseCount: records.length, files: [file], sourceThemes: sources, sha256: sha(JSON.stringify(records)), validation: { primaryThemesOnly: true, sourceIdsUnique: true } }
  fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  index.courses.push({ theme: 'mixed', stage, exerciseCount: records.length, chunkCount: 1, path: `${runtimePath}/mixed-${stage.toLowerCase()}`, sources, sha256: manifest.sha256 })
}
fs.writeFileSync(path.join(output, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
const generatedCourses = index.taxonomy.active.map((course) => ({
 trainerKey: course.trainerKey,
 theme: course.theme,
 label: course.label,
 stage: Number(course.stage.slice(1)),
 exerciseCount: course.exerciseCount,
 chunkCount: course.chunkCount,
 learnerDataBasePath: course.path,
}))
const generatedTaxonomy = `// Generated by scripts/build-verified-lichess-runtime-corpus.mjs. Do not edit by hand.

export const VERIFIED_FINAL_RUNTIME_VERSION = '${runtimeVersion}' as const
export const VERIFIED_FINAL_RUNTIME_PATH = '${runtimePath}' as const

export type VerifiedFinalTacticCourse = {
  trainerKey: string
  theme: string
  label: string
  stage: 1 | 2 | 3 | 4
  exerciseCount: number
  chunkCount: number
  learnerDataBasePath: string
}

export const VERIFIED_FINAL_TACTIC_COURSES: readonly VerifiedFinalTacticCourse[] = ${JSON.stringify(generatedCourses, null, 2)} as const

export const VERIFIED_FINAL_TACTIC_COURSE_BY_TRAINER_KEY = Object.fromEntries(
 VERIFIED_FINAL_TACTIC_COURSES.map((course) => [course.trainerKey, course]),
) as Record<string, VerifiedFinalTacticCourse>

export const VERIFIED_FINAL_TACTIC_UNAVAILABLE = ${JSON.stringify(unavailableCourses, null, 2)} as const
`
fs.mkdirSync(path.dirname(taxonomyModule), { recursive: true })
fs.writeFileSync(taxonomyModule, generatedTaxonomy)
console.log(JSON.stringify({ output, totalExercises: index.totalExercises, courses: index.courses }, null, 2))
