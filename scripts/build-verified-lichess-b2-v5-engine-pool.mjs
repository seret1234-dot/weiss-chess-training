import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { replayTrace } from './lib/verified-lichess-replay-trace.mjs'
import { exactSymmetryFamilyId } from './lib/verified-lichess-exact-symmetry-family-v3.mjs'

const root = process.cwd()
const local = path.join(root, '.local-verified-lichess-tactics-v1')
const input = path.join(local, 'b2-v5-final-r3.ndjson')
const output = path.join(local, 'b2-v5-engine-pool.json')
const sourceFingerprint = '4f37f497a245384d6d37c81c5b3d14ab7d62772fe8f95bd0edadf87763c54852'
const courseConfig = Object.freeze({ zwischencheck: { label: 'Zwischencheck M1', primary: 100, reserve: 40 }, zwischenzug: { label: 'Capture Zwischenzug M1', primary: 100, reserve: 40 } })
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const region = (square) => square ? `${square[0] < 'e' ? 'queen' : 'king'}-${Number(square[1]) < 5 ? 'low' : 'high'}` : 'unknown'
const ratingBand = (rating) => `${Math.floor(Number(rating) / 300) * 300}`
const identityType = (id) => id ? `${id[0]}${id[1]}` : 'unknown'

export function candidateFeatures(source, finding) {
  const trace = replayTrace(source.sourceFen, [source.preMove, ...source.sourceM2Line])
  const capture = trace[0], inserted = trace[1], reply = trace[2]
  return {
    ratingBand: ratingBand(source.rating),
    sourceThemes: [...(source.rawLichessTags ?? [])].sort().join('|') || 'untagged',
    capturer: identityType(capture.movingPieceId),
    capturedLearnerPiece: identityType(capture.capturedPieceId),
    recaptureSquare: capture.destinationSquare,
    boardRegion: region(capture.destinationSquare),
    routineRecaptureCount: finding.evidence.immediateRecaptures.length,
    outcome: finding.evidence.laterRecapture ? 'identity-recapture' : 'mate-supersession',
    sideToMove: source.displayedFen.split(/\s+/)[1],
    lineLength: source.sourceM2Line.length,
    responsePattern: reply ? `${reply.sourceSquare}-${reply.destinationSquare}-${reply.capturedPieceId ? 'capture' : 'quiet'}` : 'none',
    insertedMove: inserted.moveUci,
    materialConfiguration: `${identityType(capture.movingPieceId)}x${identityType(capture.capturedPieceId)}`,
  }
}

const featureValue = (features, key) => String(features[key])
const sortKey = (candidate) => `${hash(`${candidate.source.sourcePuzzleId}|${candidate.exactSymmetryFamilyId}`).slice(0, 16)}|${candidate.source.sourcePuzzleId}`

export function selectDiverseCandidates(candidates, limit, alreadyUsedSourceIds = new Set()) {
  const dimensions = ['ratingBand', 'sourceThemes', 'capturer', 'capturedLearnerPiece', 'recaptureSquare', 'boardRegion', 'routineRecaptureCount', 'outcome', 'sideToMove', 'lineLength', 'responsePattern', 'materialConfiguration']
  const remaining = candidates
    .filter((candidate) => !alreadyUsedSourceIds.has(candidate.source.sourcePuzzleId))
    .sort((left, right) => sortKey(left).localeCompare(sortKey(right)))
  const usedFamilies = new Set(), counts = new Map(), selected = []
  while (selected.length < limit) {
    let nextIndex = -1; let nextScore = Number.POSITIVE_INFINITY; let nextKey = ''
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]
      if (usedFamilies.has(candidate.exactSymmetryFamilyId)) continue
      const score = dimensions.reduce((total, dimension) => total + (counts.get(`${dimension}:${featureValue(candidate.features, dimension)}`) ?? 0), 0)
      const key = sortKey(candidate)
      if (score < nextScore || (score === nextScore && key < nextKey)) { nextIndex = index; nextScore = score; nextKey = key }
    }
    if (nextIndex < 0) break
    const [next] = remaining.splice(nextIndex, 1)
    selected.push(next); usedFamilies.add(next.exactSymmetryFamilyId)
    for (const dimension of dimensions) {
      const key = `${dimension}:${featureValue(next.features, dimension)}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return selected
}

async function main() {
  if (!fs.existsSync(input)) throw new Error(`missing accepted V5-final input: ${input}`)
  const buckets = Object.fromEntries(Object.keys(courseConfig).map((key) => [key, []]))
  for await (const line of readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity })) {
    if (!line) continue
    const row = JSON.parse(line), finding = row.production?.[0]
    if (!row.agreement || finding?.status !== 'MECHANISM_SUPPORTED_ENGINE_REQUIRED' || finding.extraction !== 'EXTRACTABLE_M1' || !courseConfig[finding.key]) continue
    const exactSymmetryFamilyId = exactSymmetryFamilyIdFor(row.source)
    buckets[finding.key].push({ source: row.source, finding, exactSymmetryFamilyId, features: candidateFeatures(row.source, finding) })
  }
  const usedSourceIds = new Set(), courses = {}
  for (const [key, config] of Object.entries(courseConfig)) {
    const selected = selectDiverseCandidates(buckets[key], config.primary + config.reserve, usedSourceIds)
    for (const candidate of selected) usedSourceIds.add(candidate.source.sourcePuzzleId)
    courses[key] = { label: config.label, available: buckets[key].length, primary: selected.slice(0, config.primary), reserve: selected.slice(config.primary), exactSymmetryFamilies: new Set(selected.map((candidate) => candidate.exactSymmetryFamilyId)).size }
    if (courses[key].primary.length < config.primary || courses[key].reserve.length < config.reserve) throw new Error(`${config.label} cannot satisfy its 100 + 40 bounded pool`)
  }
  const pool = { version: 'b2-v5-engine-pool-v1', sourceFingerprint, source: input, courseConfig, courses, uniqueSourceJobs: usedSourceIds.size, stockfishStarted: false }
  fs.writeFileSync(output, `${JSON.stringify(pool, null, 2)}\n`)
  console.log(JSON.stringify({ output, uniqueSourceJobs: pool.uniqueSourceJobs, courses: Object.fromEntries(Object.entries(courses).map(([key, value]) => [key, { available: value.available, primary: value.primary.length, reserve: value.reserve.length, exactSymmetryFamilies: value.exactSymmetryFamilies }])) }, null, 2))
}

function exactSymmetryFamilyIdFor(source) { return exactSymmetryFamilyId(source) }

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
