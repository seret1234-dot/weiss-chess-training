import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { puzzleArray, validateTacticRecord } from './lib/pattern-tactic-semantic-validator.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backupRoot = process.env.CHESS_TRAINER_PRECUT_BACKUP
  ? path.resolve(process.env.CHESS_TRAINER_PRECUT_BACKUP)
  : String.raw`E:\chess trainer backup\25-7\2\chess-trainer`
const outputRoot = path.join(repoRoot, 'public', 'data', 'full-curricula-v1')
const reportRoot = path.join(repoRoot, 'reports', 'chunks')
const inventoryPath = path.join(reportRoot, 'full-chunk-inventory.json')
const generatedCatalogPath = path.join(repoRoot, 'src', 'trainers', 'fullChunkCurriculumCatalog.ts')
const checkOnly = process.argv.includes('--check')

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const slash = (value) => value.replaceAll('\\', '/')
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))
const identity = (record) => String(record?.puzzleId ?? record?.lichessId ?? record?.lichess_id ?? record?.PuzzleId ?? record?.localId ?? record?.id ?? '')
const recordsFrom = (value) => Array.isArray(value)
  ? value
  : Array.isArray(value?.exercises)
    ? value.exercises
    : puzzleArray(value)
const withRecords = (value, records) => Array.isArray(value)
  ? records
  : Array.isArray(value?.puzzles)
    ? { ...value, puzzles: records }
    : Array.isArray(value?.exercises)
      ? { ...value, exercises: records }
      : { ...value, puzzles: records }

async function findManifests(root) {
  const files = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(target)
      else if (entry.name === 'manifest.json') files.push(target)
    }
  }
  await walk(root)
  return files.sort()
}

async function readCourse(sourceDir, { allowMissing = false } = {}) {
  const manifestFile = path.join(sourceDir, 'manifest.json')
  const manifest = await readJson(manifestFile)
  const files = manifest.files ?? manifest.chunks?.map((entry) => entry.file).filter(Boolean) ?? []
  const chunks = []
  for (const file of files) {
    let raw
    try { raw = await readJson(path.join(sourceDir, file)) }
    catch (error) {
      if (!allowMissing) throw error
      chunks.push({ file, raw: null, records: [], missing: true })
      continue
    }
    chunks.push({ file, raw, records: recordsFrom(raw) })
  }
  return { sourceDir, manifest, files, chunks, totalPuzzles: chunks.reduce((sum, chunk) => sum + chunk.records.length, 0) }
}

async function currentCourseIfPresent(relativePath) {
  const target = path.join(repoRoot, 'public', 'data', ...relativePath.split('/'))
  try { return await readCourse(target) } catch { return null }
}

async function reducedCounts(family, theme, distance) {
  const candidates = family === 'tactics'
    ? [`verified-lichess-tactics-v1/final-v6/${theme === 'mixed' ? 'mixed' : theme}-m${distance}`]
    : theme === 'mixed'
      ? [`pattern-mates/mixed/mate-in-${distance}`]
      : [`learner-curricula/pattern-mates/${theme}-m${distance}-v1`]
  for (const candidate of candidates) {
    const course = await currentCourseIfPresent(candidate)
    if (course) return { path: `/data/${candidate}`, chunks: course.files.length, puzzles: course.totalPuzzles }
  }
  return { path: null, chunks: 0, puzzles: 0 }
}

async function writeCourse({ source, destination, family, theme, distance, sourceReference, currentReplacement, filterTactics = false }) {
  const course = await readCourse(source)
  const replacementMap = new Map()
  if (currentReplacement) {
    const current = await currentCourseIfPresent(currentReplacement)
    if (current) for (const chunk of current.chunks) for (const record of chunk.records) replacementMap.set(identity(record), record)
  }
  const excluded = []
  const outputChunks = []
  for (const chunk of course.chunks) {
    const records = []
    for (const sourceRecord of chunk.records) {
      if (filterTactics) {
        const verdict = validateTacticRecord(sourceRecord, theme)
        if (verdict.status === 'MISCLASSIFIED' || verdict.status === 'BROKEN / ILLEGAL') {
          excluded.push({ id: identity(sourceRecord), sourceFile: chunk.file, status: verdict.status, reason: verdict.reason })
          continue
        }
      }
      const replacement = replacementMap.get(identity(sourceRecord))
      records.push(replacement ?? sourceRecord)
    }
    if (!records.length) throw new Error(`Quality filtering emptied ${sourceReference}/${chunk.file}`)
    outputChunks.push({ file: chunk.file, raw: withRecords(chunk.raw, records), records })
  }
  const files = outputChunks.map((chunk) => chunk.file)
  const totalPuzzles = outputChunks.reduce((sum, chunk) => sum + chunk.records.length, 0)
  const ids = outputChunks.flatMap((chunk) => chunk.records.map(identity))
  const uniquePuzzleCount = new Set(ids).size
  const manifest = {
    ...course.manifest,
    schemaVersion: Math.max(2, Number(course.manifest.schemaVersion) || 0),
    curriculumVersion: 'full-precut-v1',
    restoredFrom: sourceReference,
    restorationPolicy: filterTactics
      ? 'Original order retained; only deterministic MISCLASSIFIED or BROKEN / ILLEGAL records are excluded.'
      : 'Original membership and order retained; matching later repaired payloads supersede stale backup payloads.',
    totalPuzzles,
    totalChunks: files.length,
    chunkSize: Number(course.manifest.chunkSize) || 30,
    files,
    excludedPuzzleCount: excluded.length,
    excludedPuzzleIds: excluded.map((entry) => entry.id),
  }
  if (theme === 'mixed') {
    manifest.sourceThemes = [...new Set(outputChunks.flatMap((chunk) => chunk.records.flatMap((record) =>
      record.sourceThemeKeys ?? record.sourceThemes ?? [record.canonicalThemeKey ?? record.sourceTheme ?? record.theme].filter(Boolean),
    )).map(String))].sort()
  }
  const relativeDestination = slash(path.relative(path.join(repoRoot, 'public'), destination))
  if (!checkOnly) {
    await mkdir(destination, { recursive: true })
    for (const chunk of outputChunks) await writeFile(path.join(destination, chunk.file), `${JSON.stringify(chunk.raw, null, 2)}\n`)
    await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
  return {
    family,
    theme,
    distance,
    key: family === 'tactics' ? `${theme}/m${distance}` : `${theme}/mate-in-${distance}`,
    trainerKey: family === 'tactics' ? `tactic-${theme}-m${distance}` : null,
    sourceReference,
    restoredPath: `/${relativeDestination}`,
    files,
    preCutChunks: course.files.length,
    preCutPuzzles: course.totalPuzzles,
    restoredChunks: files.length,
    restoredPuzzles: totalPuzzles,
    chunkSize: Number(course.manifest.chunkSize) || 30,
    excluded,
    ids,
    uniquePuzzleCount,
    duplicatePuzzleOccurrences: ids.length - uniquePuzzleCount,
    membershipHash: sha256(ids.join('\n')),
    chunkMembershipHashes: outputChunks.map((chunk) => ({
      file: chunk.file,
      puzzleCount: chunk.records.length,
      membershipHash: sha256(chunk.records.map(identity).join('\n')),
    })),
  }
}

const tacticCourses = []
const backupTacticsRoot = path.join(backupRoot, 'public', 'data', 'pattern-tactics')
for (const manifestFile of await findManifests(backupTacticsRoot)) {
  const rel = slash(path.relative(backupTacticsRoot, path.dirname(manifestFile)))
  const match = rel.match(/^(.+)\/m([1-4])$/)
  if (!match) continue
  const [, theme, distanceText] = match
  const distance = Number(distanceText)
  tacticCourses.push(await writeCourse({
    source: path.dirname(manifestFile),
    destination: path.join(outputRoot, 'pattern-tactics', theme, `m${distance}`),
    family: 'tactics', theme, distance,
    sourceReference: `backup:public/data/pattern-tactics/${rel}`,
    filterTactics: theme !== 'mixed',
  }))
}

const mateSources = []
const backupMatesRoot = path.join(backupRoot, 'public', 'data', 'pattern-mates')
for (const manifestFile of await findManifests(backupMatesRoot)) {
  const rel = slash(path.relative(backupMatesRoot, path.dirname(manifestFile)))
  const match = rel.match(/^(.+)\/mate-in-([1-5])$/)
  if (!match || match[1] === 'kill-box' || match[1] === 'stalemate/underpromotion') continue
  mateSources.push({ theme: match[1], distance: Number(match[2]), source: path.dirname(manifestFile), sourceReference: `backup:public/data/pattern-mates/${rel}`, currentReplacement: `pattern-mates/${rel}` })
}
mateSources.push({ theme: 'back-rank', distance: 1, source: path.join(backupRoot, 'public', 'data', 'lichess', 'mate_in_1', 'back_rank'), sourceReference: 'backup:public/data/lichess/mate_in_1/back_rank', currentReplacement: 'lichess/mate_in_1/back_rank' })
for (const distance of [1, 2, 3, 4, 5]) mateSources.push({ theme: 'anastasia', distance, source: path.join(backupRoot, 'public', 'data', 'lichess', `mate_in_${distance}`, 'anastasia'), sourceReference: `backup:public/data/lichess/mate_in_${distance}/anastasia`, currentReplacement: `lichess/mate_in_${distance}/anastasia` })

const mateCourses = []
for (const entry of mateSources.sort((a, b) => a.distance - b.distance || a.theme.localeCompare(b.theme))) {
  mateCourses.push(await writeCourse({
    ...entry,
    destination: path.join(outputRoot, 'pattern-mates', entry.theme, `mate-in-${entry.distance}`),
    family: 'mates',
  }))
}

const killBoxCourses = []
for (const theme of ['kill-box-adjacent-rook', 'kill-box-rook-rail', 'kill-box-queen-fence']) {
  for (const distance of [1, 2, 3, 4, 5]) {
    const relative = `pattern-mates/${theme}/mate-in-${distance}`
    const source = path.join(repoRoot, 'public', 'data', ...relative.split('/'))
    killBoxCourses.push(await writeCourse({
      source,
      destination: path.join(outputRoot, 'pattern-mates', theme, `mate-in-${distance}`),
      family: 'mates', theme, distance,
      sourceReference: `current:public/data/${relative}`,
    }))
  }
}

const oldKillBox = []
for (const distance of [1, 2, 3, 4, 5]) {
  const course = await readCourse(path.join(backupMatesRoot, 'kill-box', `mate-in-${distance}`))
  oldKillBox.push({ distance, chunks: course.files.length, puzzles: course.totalPuzzles })
}
let holdingCount = 0
for (const distance of [1, 2, 3, 4, 5]) {
  const holdingCourse = await readCourse(path.join(repoRoot, 'public', 'data', 'pattern-mates', 'kill-box-unclassified', `mate-in-${distance}`))
  holdingCount += holdingCourse.totalPuzzles
}

for (const course of [...tacticCourses, ...mateCourses, ...killBoxCourses]) {
  const reduced = await reducedCounts(course.family, course.theme, course.distance)
  course.reducedPath = reduced.path
  course.reducedChunks = reduced.chunks
  course.reducedPuzzles = reduced.puzzles
  course.missingIds = course.excluded.map((entry) => entry.id)
  course.extraIds = []
  delete course.ids
}

const otherFamilies = []
for (const family of ['endgames', 'kqkr', 'stalemate']) {
  const sourceRoot = path.join(backupRoot, 'public', 'data', family)
  for (const manifestFile of await findManifests(sourceRoot)) {
    const rel = slash(path.relative(path.join(backupRoot, 'public', 'data'), path.dirname(manifestFile)))
    const before = await readCourse(path.dirname(manifestFile), { allowMissing: true })
    const currentRoot = path.join(repoRoot, 'public', 'data', ...rel.split('/'))
    let current = null
    try { current = await readCourse(currentRoot, { allowMissing: true }) } catch {}
    otherFamilies.push({
      family,
      key: rel,
      sourceReference: `backup:public/data/${rel}`,
      restoredPath: `/data/${rel}`,
      preCutChunks: before.files.length,
      reducedChunks: current?.files.length ?? 0,
      restoredChunks: current?.files.length ?? 0,
      preCutPuzzles: before.totalPuzzles,
      reducedPuzzles: current?.totalPuzzles ?? 0,
      restoredPuzzles: current?.totalPuzzles ?? 0,
      chunkSize: Number(before.manifest.chunkSize) || null,
      status: 'unaffected-non-pattern-family',
      missingPreCutChunkFiles: before.chunks.filter((chunk) => chunk.missing).map((chunk) => chunk.file),
    })
  }
}

const regularRows = [...tacticCourses, ...mateCourses, ...killBoxCourses]
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)
const reducedTotals = {
  tactics: { chunks: sum(tacticCourses, 'reducedChunks'), puzzles: sum(tacticCourses, 'reducedPuzzles') },
  matesWithoutKillBox: { chunks: sum(mateCourses, 'reducedChunks'), puzzles: sum(mateCourses, 'reducedPuzzles') },
  killBox: { chunks: sum(killBoxCourses, 'reducedChunks'), puzzles: sum(killBoxCourses, 'reducedPuzzles') },
}
const totals = {
  preCut: {
    chunks: sum(tacticCourses, 'preCutChunks') + sum(mateCourses, 'preCutChunks') + sum(oldKillBox, 'chunks'),
    puzzles: sum(tacticCourses, 'preCutPuzzles') + sum(mateCourses, 'preCutPuzzles') + sum(oldKillBox, 'puzzles'),
  },
  reduced: {
    chunks: reducedTotals.tactics.chunks + reducedTotals.matesWithoutKillBox.chunks + reducedTotals.killBox.chunks,
    puzzles: reducedTotals.tactics.puzzles + reducedTotals.matesWithoutKillBox.puzzles + reducedTotals.killBox.puzzles,
  },
  restored: {
    chunks: sum(regularRows, 'restoredChunks'),
    puzzles: sum(regularRows, 'restoredPuzzles'),
  },
}

const inventory = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  authoritativeBackup: backupRoot,
  reductionCommits: [
    { commit: 'a5b55741fe09439413f54251e67d10effbd9bd11', date: '2026-07-30', scope: 'Pattern Mate M1: five curated chunks' },
    { commit: '99b7a4bd0af4b507c1b161e869bf13c150a8bd54', date: '2026-08-01', scope: 'Pattern Mate M2-M5: normally eight curated chunks' },
    { commit: 'd6d01603f5a7d07b9f6aae3da21346a02d91a434', date: '2026-08-01', scope: 'Pattern Tactics M1-M4: five/eight curated chunks' },
  ],
  totals,
  deterministicTacticExclusions: tacticCourses.reduce((total, course) => total + course.excluded.length, 0),
  killBox: {
    old: oldKillBox,
    preCutChunks: sum(oldKillBox, 'chunks'),
    preCutPuzzles: sum(oldKillBox, 'puzzles'),
    restoredTrainingChunks: sum(killBoxCourses, 'restoredChunks'),
    restoredTrainingPuzzles: sum(killBoxCourses, 'restoredPuzzles'),
    holdingNonTraining: holdingCount,
    reconciliation: sum(killBoxCourses, 'restoredPuzzles') + holdingCount,
  },
  courses: regularRows.map(({ excluded, files, ...course }) => ({ ...course, chunkFiles: files, excludedCount: excluded.length, excluded })),
  unaffectedOtherChunkFamilies: otherFamilies,
}

const tacticCatalog = tacticCourses.map((course) => ({ trainerKey: course.trainerKey, theme: course.theme, tacticDistance: course.distance, dataBasePath: course.restoredPath, chunkCount: course.restoredChunks, puzzleCount: course.restoredPuzzles, chunkSize: course.chunkSize, excludedCount: course.excluded.length }))
const mateCatalog = [...mateCourses, ...killBoxCourses].filter((course) => course.theme !== 'mixed').map((course) => ({ theme: course.theme, mateDistance: course.distance, dataBasePath: course.restoredPath, chunkCount: course.restoredChunks, puzzleCount: course.restoredPuzzles, chunkSize: course.chunkSize }))
const mixedTactics = tacticCourses.filter((course) => course.theme === 'mixed').map((course) => ({ distance: course.distance, dataBasePath: course.restoredPath, chunkCount: course.restoredChunks, puzzleCount: course.restoredPuzzles, chunkSize: course.chunkSize }))
const mixedMates = mateCourses.filter((course) => course.theme === 'mixed').map((course) => ({ distance: course.distance, dataBasePath: course.restoredPath, chunkCount: course.restoredChunks, puzzleCount: course.restoredPuzzles, chunkSize: course.chunkSize }))
const catalogSource = `// Generated by scripts/restore-full-chunk-curricula.mjs. Do not edit by hand.\n\nexport const FULL_CHUNK_CURRICULUM_VERSION = 'full-precut-v1' as const\nexport const FULL_PATTERN_TACTIC_COURSES = ${JSON.stringify(tacticCatalog, null, 2)} as const\nexport const FULL_PATTERN_MATE_COURSES = ${JSON.stringify(mateCatalog, null, 2)} as const\nexport const FULL_MIXED_TACTIC_COURSES = ${JSON.stringify(mixedTactics, null, 2)} as const\nexport const FULL_MIXED_MATE_COURSES = ${JSON.stringify(mixedMates, null, 2)} as const\nexport const FULL_PATTERN_TACTIC_COURSE_BY_TRAINER_KEY = Object.fromEntries(FULL_PATTERN_TACTIC_COURSES.map((course) => [course.trainerKey, course]))\nexport const FULL_PATTERN_MATE_COURSE_BY_KEY = Object.fromEntries(FULL_PATTERN_MATE_COURSES.map((course) => [\`${'${course.theme}'}-m${'${course.mateDistance}'}\`, course]))\n`

if (!checkOnly) {
  await mkdir(reportRoot, { recursive: true })
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)
  await writeFile(generatedCatalogPath, catalogSource)
}

console.log(JSON.stringify({ checkOnly, backupRoot, outputRoot, totals, tacticCourses: tacticCourses.length, mateCourses: mateCourses.length, killBoxCourses: killBoxCourses.length, tacticExclusions: inventory.deterministicTacticExclusions, holdingCount, catalogHash: sha256(catalogSource) }, null, 2))
