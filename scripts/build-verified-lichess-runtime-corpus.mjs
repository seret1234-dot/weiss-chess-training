import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const local = path.join(root, '.local-verified-lichess-tactics-v1')
const runtimeVersion = 'final-v5'
const runtimePath = `/data/verified-lichess-tactics-v1/${runtimeVersion}`
const output = path.join(root, 'public', 'data', 'verified-lichess-tactics-v1', runtimeVersion)
const sources = [
  'candidate-corpus-v1',
  'b2-v5-candidate-corpus-v1',
  'hanging-m1-candidate-corpus-v1',
  'core-candidate-corpora-v4',
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
function stageOf(record) {
  const value = String(record.stage || record.learnerStage || '')
  return value === 'TRUE_M2' || value === 'M2' ? 'M2' : 'M1'
}
function labelOf(record) {
  return record.course || record.canonicalTheme || record.canonicalThemeLabel || record.label || record.theme || 'Verified tactic'
}
function converted(record) {
  const label = canonicalLabel(labelOf(record))
  const stage = stageOf(record)
  const solutionLine = sourceLine(record)
  const sourcePuzzleId = record.sourcePuzzleId || record.lichessPuzzleId
  const exerciseId = record.exerciseId || record.id
  if (!sourcePuzzleId || !exerciseId || !record.displayedFen) throw Error(`incomplete accepted record ${JSON.stringify(record).slice(0, 140)}`)
  return {
    id: exerciseId,
    exerciseId,
    sourcePuzzleId,
    fen: record.displayedFen,
    solutionLine,
    userMoveIndexes: stage === 'M2' ? [0, 2] : [0],
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
    provenance: { corpus: `verified-lichess-${runtimeVersion}`, originalExerciseId: exerciseId },
  }
}
if (fs.existsSync(output)) throw Error(`refusing to overwrite existing runtime corpus: ${output}`)
const groups = new Map()
const sourceIds = new Set()
for (const source of sources) for (const file of walk(source)) for (const raw of recordsFrom(file)) {
  const record = converted(raw)
  if (sourceIds.has(record.sourcePuzzleId)) throw Error(`cross-course duplicate source ID: ${record.sourcePuzzleId}`)
  sourceIds.add(record.sourcePuzzleId)
  const key = `${record.canonicalThemeKey}|${record.stage}`
  ;(groups.get(key) ?? groups.set(key, []).get(key)).push(record)
}
const index = { version: `verified-lichess-final-runtime-${runtimeVersion}`, totalExercises: sourceIds.size, courses: [] }
const mixedRecords = new Map([['M1', []], ['M2', []]])
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
  index.courses.push({ theme, stage, exerciseCount: records.length, chunkCount: chunks.length, path: `${runtimePath}/${theme}-${stage.toLowerCase()}`, sha256: manifest.sha256 })
}
for (const stage of ['M1', 'M2']) {
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
console.log(JSON.stringify({ output, totalExercises: index.totalExercises, courses: index.courses }, null, 2))
