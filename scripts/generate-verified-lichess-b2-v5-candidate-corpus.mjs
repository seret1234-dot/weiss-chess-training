import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Chess } from 'chess.js'

const root = process.cwd(), localRoot = path.join(root, '.local-verified-lichess-tactics-v1')
const destination = path.join(localRoot, 'b2-v5-candidate-corpus-v1')
const pool = JSON.parse(fs.readFileSync(path.join(localRoot, 'b2-v5-engine-pool.json'), 'utf8'))
const results = fs.readFileSync(path.join(localRoot, 'b2-v5-stockfish-results.ndjson'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
const replace = process.argv.includes('--replace')
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex')
const move = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })
const replay = (source) => { const game = new Chess(source.sourceFen); for (const uci of [source.preMove, ...source.sourceM2Line]) if (!game.move(move(uci))) throw new Error(`illegal replay ${source.sourcePuzzleId} ${uci}`) }
const median = (numbers) => { const sorted = [...numbers].sort((left, right) => left - right); return sorted[Math.floor((sorted.length - 1) / 2)] }
const courseLabel = { zwischencheck: 'Zwischencheck M1', zwischenzug: 'Capture Zwischenzug M1' }
const resultById = new Map(results.map((result) => [result.sourcePuzzleId, result]))

function record(candidate, result, course, selection) {
  replay(candidate.source)
  const engine = result.depth16 ?? result.depth14, evidence = candidate.finding.evidence
  return {
    id: `verified-lichess-b2-v1-${sha(`${course}|${candidate.source.sourcePuzzleId}|${candidate.exactSymmetryFamilyId}`).slice(0, 24)}`,
    sourcePuzzleId: candidate.source.sourcePuzzleId,
    displayedFen: candidate.source.displayedFen,
    sourceFen: candidate.source.sourceFen,
    completeLegalLine: [candidate.source.preMove, ...candidate.source.sourceM2Line],
    learnerMove: candidate.source.sourceM2Line[0],
    opponentReplies: candidate.source.sourceM2Line.filter((_, index) => index % 2 === 1),
    canonicalSubtype: course,
    canonicalTheme: courseLabel[course],
    stage: 'M1',
    rating: candidate.source.rating,
    sourceMetadata: { themes: candidate.source.rawLichessTags, popularity: candidate.source.popularity, playCount: candidate.source.playCount, gameUrl: candidate.source.sourceGameUrl },
    exactSymmetryFamilyId: candidate.exactSymmetryFamilyId,
    originalCapture: { move: evidence.originalCapture, recaptureSquare: evidence.recaptureSquare },
    legalImmediateRoutineRecaptures: evidence.immediateRecaptures,
    insertedMove: evidence.insertedMove,
    laterExactRecapture: evidence.laterRecapture,
    mateSupersession: evidence.mateSupersession,
    structuralResult: { status: candidate.finding.status, subtype: candidate.finding.key, stage: candidate.finding.extraction, evidence },
    independentReferenceResult: { supported: true, subtype: course, stage: 'EXTRACTABLE_M1' },
    engineComparison: { outcome: result.status, reason: result.reason, depth14: result.depth14, depth16: result.depth16, finalDepth: engine.depth, configuration: result.engineConfiguration },
    validationIdentity: sha(`${candidate.source.sourcePuzzleId}|${candidate.exactSymmetryFamilyId}|${JSON.stringify(result.engineConfiguration)}`),
    selection,
  }
}

function selectedForCourse(course) {
  const picked = [], usedFamilies = new Set()
  for (const selection of ['primary', 'reserve']) for (const candidate of pool.courses[course][selection]) {
    if (picked.length === 100 || usedFamilies.has(candidate.exactSymmetryFamilyId)) continue
    const result = resultById.get(candidate.source.sourcePuzzleId)
    if (!result || result.status !== 'APPROVED') continue
    picked.push(record(candidate, result, course, selection)); usedFamilies.add(candidate.exactSymmetryFamilyId)
  }
  if (picked.length < 20) throw new Error(`${course} fails the 20-record activation threshold`)
  return picked
}

function writeCourse(course, records) {
  const dir = path.join(destination, course); fs.mkdirSync(dir, { recursive: true })
  const chunks = []; for (let index = 0; index < records.length; index += 20) { const id = `${course}-chunk-${chunks.length + 1}`; const chunk = { id, course, records: records.slice(index, index + 20) }; fs.writeFileSync(path.join(dir, `${id}.json`), `${JSON.stringify(chunk, null, 2)}\n`); chunks.push({ id, count: chunk.records.length, file: `${id}.json` }) }
  const manifest = { course, label: courseLabel[course], stage: 'M1', recordCount: records.length, chunkCount: chunks.length, chunks }
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

function review(courses) {
  const lines = ['# B2 V5 local candidate-corpus review', '', `Source fingerprint: \`${pool.sourceFingerprint}\``, '', 'Only individually Stockfish-approved strict V5 records are included. TRUE-M2 courses remain unavailable.', '']
  for (const [course, records] of Object.entries(courses)) {
    const ratings = records.map((record) => record.rating), checks = records.filter((record) => record.canonicalSubtype === 'zwischencheck').length, mates = records.filter((record) => record.mateSupersession).length
    const primary = records.filter((record) => record.selection === 'primary').length, reserve = records.length - primary
    lines.push(`## ${courseLabel[course]}`, '', `- records/chunks: ${records.length}/${Math.ceil(records.length / 20)}; primary/reserve: ${primary}/${reserve}; exact-symmetry families: ${new Set(records.map((record) => record.exactSymmetryFamilyId)).size}.`, `- rating min/median/max: ${Math.min(...ratings)}/${median(ratings)}/${Math.max(...ratings)}; checking records: ${checks}; mate supersession: ${mates}.`, '', '| Puzzle | Rating | FEN | Learner move | Routine recaptures | Engine result |', '|---|---:|---|---|---|---|')
    for (const item of records.slice(0, 10)) lines.push(`| ${item.sourcePuzzleId} | ${item.rating} | \`${item.displayedFen}\` | \`${item.learnerMove}\` | ${item.legalImmediateRoutineRecaptures.join(', ')} | ${item.engineComparison.reason} |`)
    lines.push('')
  }
  lines.push('## Taxonomy dispositions', '', '- Zwischencheck M1: candidate-ready.', '- Capture Zwischenzug M1: candidate-ready.', '- Zwischencheck TRUE M2: unavailable pending a non-extractable M2 validator.', '- Capture Zwischenzug TRUE M2: unavailable pending a non-extractable M2 validator.', '- Broader intermezzo forms: WEAK_TAG_ONLY / pending broader validators.', '')
  return lines.join('\n')
}

function main() {
  if (fs.existsSync(destination)) { if (!replace) throw new Error(`destination already exists: ${destination}`); fs.rmSync(destination, { recursive: true, force: true }) }
  const courses = { zwischencheck: selectedForCourse('zwischencheck'), zwischenzug: selectedForCourse('zwischenzug') }
  const sourceIds = Object.values(courses).flat().map((record) => record.sourcePuzzleId), exerciseIds = Object.values(courses).flat().map((record) => record.id)
  if (new Set(sourceIds).size !== sourceIds.length || new Set(exerciseIds).size !== exerciseIds.length) throw new Error('candidate corpus identity collision')
  for (const records of Object.values(courses)) if (new Set(records.map((record) => record.exactSymmetryFamilyId)).size !== records.length || records.some((record) => record.engineComparison.outcome !== 'APPROVED')) throw new Error('candidate corpus validation failure')
  fs.mkdirSync(destination, { recursive: true }); const manifests = Object.fromEntries(Object.entries(courses).map(([course, records]) => [course, writeCourse(course, records)]))
  const index = { version: 'verified-lichess-b2-v5-candidate-corpus-v1', sourceFingerprint: pool.sourceFingerprint, records: sourceIds.length, manifests, coursesUnavailable: ['Zwischencheck TRUE M2', 'Capture Zwischenzug TRUE M2'] }
  const serialized = `${JSON.stringify(index, null, 2)}\n`; fs.writeFileSync(path.join(destination, 'index.json'), serialized); fs.writeFileSync(path.join(destination, 'review.md'), `${review(courses)}\n`)
  const corpusHash = sha(Object.values(courses).flat().map((record) => JSON.stringify(record)).join('\n')); fs.writeFileSync(path.join(destination, 'integrity.json'), `${JSON.stringify({ corpusHash, sourceIdUnique: true, exerciseIdUnique: true, exactFamilyUniqueWithinCourse: true, approvedOnly: true, localOnly: true }, null, 2)}\n`)
  console.log(JSON.stringify({ destination, records: sourceIds.length, manifests, corpusHash }, null, 2))
}
main()
