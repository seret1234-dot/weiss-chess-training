import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const root = process.cwd(), audit = path.join(root, 'audit-reports/verified-lichess-tactics-v1')
const source = path.join(audit, 'exhaustive-b1-structural.ndjson')
const destination = path.join(audit, 'exhaustive-b1-validation-pool.json')
const config = Object.freeze({ 'Promotion:M1': 150, 'Promotion:M2': 240, 'Knight Underpromotion:M1': 150, 'Knight Underpromotion:M2': 240, 'En Passant:M1': 150, 'En Passant:M2': 240 })
const keyFor = (finding) => finding.candidateCategory === 'underpromotion' ? finding.label : finding.label
const stageFor = (finding) => finding.extraction === 'EXTRACTABLE_M1' ? 'M1' : finding.extraction === 'TRUE_M2' ? 'M2' : null
const region = (square) => square ? `${square[0] < 'e' ? 'queen' : 'king'}-${Number(square[1]) <= 4 ? 'low' : 'high'}` : 'unknown'
const ratingBand = (rating) => `${Math.floor(Number(rating) / 300) * 300}-${Math.floor(Number(rating) / 300) * 300 + 299}`
const featureKey = (source, finding) => [finding.exactSymmetryFamilyId, ratingBand(source.rating), finding.evidence.givesCheck ? 'check' : 'quiet', finding.evidence.capture ? 'capture' : 'noncapture', finding.evidence.promotedPiece ?? 'ep', region(finding.evidence.promotionSquare ?? finding.evidence.captureMove?.slice(2, 4)), finding.evidence.centralityReason ?? finding.evidence.queenInferiorityReason ?? 'other'].join('|')

function choose(items, limit) {
  const ordered = [...items].sort((a, b) => featureKey(a.source, a.finding).localeCompare(featureKey(b.source, b.finding)) || a.source.sourcePuzzleId.localeCompare(b.source.sourcePuzzleId))
  const usedFamilies = new Set(), featureCounts = new Map(), picked = []
  while (picked.length < limit && ordered.length) {
    ordered.sort((a, b) => {
      const fa = featureKey(a.source, a.finding), fb = featureKey(b.source, b.finding)
      const sa = (usedFamilies.has(a.finding.exactSymmetryFamilyId) ? 100000 : 0) + (featureCounts.get(fa) ?? 0)
      const sb = (usedFamilies.has(b.finding.exactSymmetryFamilyId) ? 100000 : 0) + (featureCounts.get(fb) ?? 0)
      return sa - sb || fa.localeCompare(fb) || a.source.sourcePuzzleId.localeCompare(b.source.sourcePuzzleId)
    })
    const next = ordered.shift(); picked.push(next)
    usedFamilies.add(next.finding.exactSymmetryFamilyId)
    const feature = featureKey(next.source, next.finding); featureCounts.set(feature, (featureCounts.get(feature) ?? 0) + 1)
  }
  return picked
}

const groups = Object.fromEntries(Object.keys(config).map((key) => [key, []]))
const underEngineRequired = [], bishopVerified = []
for await (const line of readline.createInterface({ input: fs.createReadStream(source), crlfDelay: Infinity })) {
  if (!line) continue
  const entry = JSON.parse(line)
  for (const finding of entry.findings) {
    const type = keyFor(finding), stage = stageFor(finding)
    if (finding.status === 'STRUCTURALLY_VERIFIED' && stage && config[`${type}:${stage}`]) groups[`${type}:${stage}`].push({ source: entry.source, finding })
    if (finding.status === 'ENGINE_REQUIRED' && finding.candidateCategory === 'underpromotion') underEngineRequired.push({ source: entry.source, finding })
    if (finding.status === 'STRUCTURALLY_VERIFIED' && type === 'Bishop Underpromotion') bishopVerified.push({ source: entry.source, finding })
  }
}
const selections = Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, { primary: choose(items, Math.min(config[key], key.endsWith(':M1') ? 100 : 160)), reserve: choose(items, config[key]).slice(key.endsWith(':M1') ? 100 : 160) }]))
const all = [...Object.values(selections).flatMap(({ primary, reserve }) => [...primary, ...reserve]), ...underEngineRequired, ...bishopVerified]
const jobs = [...new Map(all.map((item) => [item.source.sourcePuzzleId, { source: item.source, findings: all.filter((candidate) => candidate.source.sourcePuzzleId === item.source.sourcePuzzleId).map((candidate) => candidate.finding) }])).values()]
const output = { scope: 'LOCAL_ENGINE_VALIDATION_POOL', source, config, selections, underEngineRequired, bishopVerified, jobs, uniqueEngineJobs: jobs.length, stockfishStarted: false }
fs.writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ groups: Object.fromEntries(Object.entries(selections).map(([key, value]) => [key, { primary: value.primary.length, reserve: value.reserve.length }])), underEngineRequired: underEngineRequired.length, bishopVerified: bishopVerified.length, uniqueEngineJobs: jobs.length, destination }, null, 2))
