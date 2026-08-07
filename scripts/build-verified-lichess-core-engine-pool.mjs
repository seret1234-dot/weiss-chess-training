import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const root = process.cwd(), local = path.join(root, '.local-verified-lichess-tactics-v1')
const atomic = path.join(root, 'audit-reports/verified-lichess-tactics-v1/atomic-m2-structural-v2.ndjson')
const families = path.join(root, 'audit-reports/verified-lichess-tactics-v1/atomic-m2-exact-symmetry-family-ids-v3.ndjson')
const out = path.join(local, 'core-m1m2-engine-pool-v2.ndjson'), report = path.join(local, 'core-m1m2-engine-pool-v2-report.json')
const sources = [
  ['core-motif-onset-v1.ndjson', row => row.audit?.disposition === 'VALID_PRIMARY' && row.audit.proposed !== 'Removal of Defender by Capture' ? { course: row.audit.proposed, stage: row.audit.stage } : null],
  ['discovered-check-causal-v1.ndjson', row => row.audit?.disposition === 'VALID_PRIMARY' ? { course: 'Discovered Check', stage: row.audit.stage } : null],
  ['deflection-causal-v2.ndjson', row => row.audit?.disposition === 'MECHANISM_SUPPORTED_ENGINE_REQUIRED' ? { course: 'Deflection', stage: 'M1' } : null],
  ['removal-of-defender-causal-v2.ndjson', row => row.audit?.disposition === 'MECHANISM_SUPPORTED_ENGINE_REQUIRED' ? { course: 'Removal of Defender by Capture', stage: row.audit.stage } : null],
  ['clearance-causal-v1.ndjson', row => row.audit?.disposition === 'MECHANISM_SUPPORTED_ENGINE_REQUIRED' ? { course: row.theme, stage: row.audit.stage } : null],
]
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const cap = stage => stage === 'M1' ? 150 : 240
const finalCap = stage => stage === 'M1' ? 100 : 160
const ratingBand = rating => Math.floor((Number(rating) || 0) / 200)

async function readFamilies() { const map = new Map(), input = readline.createInterface({ input: fs.createReadStream(families), crlfDelay: Infinity }); for await (const line of input) { if (!line) continue; const row = JSON.parse(line); map.set(row.canonicalIdentity, row.exactSymmetryFamilyId) } return map }
async function main() {
  if ([out, report].some(fs.existsSync)) throw new Error('accepted engine-pool output exists; do not overwrite it')
  const familyMap = await readFamilies(), candidates = new Map()
  for (const [file, normalise] of sources) {
    const input = readline.createInterface({ input: fs.createReadStream(path.join(local, file)), crlfDelay: Infinity })
    for await (const line of input) { if (!line) continue; const row = JSON.parse(line), target = normalise(row); if (!target || !['M1', 'TRUE_M2'].includes(target.stage)) continue; const key = `${target.course}|${target.stage}`, list = candidates.get(key) ?? []; list.push({ ...target, sourcePuzzleId: row.sourcePuzzleId, canonicalIdentity: row.canonicalIdentity, rating: row.rating, family: row.audit?.exactSymmetryFamilyId ?? familyMap.get(row.canonicalIdentity) ?? row.canonicalIdentity, provenance: file }); candidates.set(key, list) }
  }
  const claimed = new Set(), selected = [] , matrix = {}
  const groups = [...candidates.entries()].sort(([a],[b]) => a.localeCompare(b))
  for (const [key, list] of groups) {
    const [course, stage] = key.split('|'), eligible = list.filter(x => x.sourcePuzzleId && x.canonicalIdentity)
    const bestByFamily = new Map(); for (const item of eligible) { const rank = hash(`${course}|${stage}|${item.family}|${ratingBand(item.rating)}|${item.sourcePuzzleId}`); if (!bestByFamily.has(item.family) || rank < bestByFamily.get(item.family).rank) bestByFamily.set(item.family, { ...item, rank }) }
    const ordered = [...bestByFamily.values()].sort((a,b) => a.rank.localeCompare(b.rank) || a.sourcePuzzleId.localeCompare(b.sourcePuzzleId))
    const keep = []; for (const item of ordered) { if (claimed.has(item.sourcePuzzleId) || keep.length >= cap(stage)) continue; claimed.add(item.sourcePuzzleId); keep.push(item) }
    matrix[key] = { structuralCandidates: eligible.length, uniqueExactSymmetryFamilies: bestByFamily.size, selectedEnginePool: keep.length, finalCap: Math.min(finalCap(stage), keep.length), available: keep.length >= 20 }
    selected.push(...keep)
  }
  const atomicById = new Map(), selectedIds = new Set(selected.map(x => x.sourcePuzzleId)), input = readline.createInterface({ input: fs.createReadStream(atomic), crlfDelay: Infinity })
  for await (const line of input) { if (!line) continue; const row = JSON.parse(line); if (selectedIds.has(row.sourcePuzzleId)) atomicById.set(row.sourcePuzzleId, row) }
  if (atomicById.size !== selectedIds.size) throw new Error(`missing atomic records for ${selectedIds.size - atomicById.size} selected source IDs`)
  const writer = fs.createWriteStream(out); for (const item of selected) writer.write(`${JSON.stringify({ ...item, source: atomicById.get(item.sourcePuzzleId), engineSettings: { stockfish: 18, threads: 1, hashMb: 64, multiPv: 3, depth: 14, timeCutoff: false } })}\n`); await new Promise(resolve => writer.end(resolve))
  const summary = { pipeline: 'core-m1m2-engine-pool-v2', complete: true, courses: matrix, selectedJobs: selected.length, uniqueSourceIds: selectedIds.size, source: 'accepted local structural outputs only; causal v2 authority overrides generic Removal results' }; fs.writeFileSync(report, `${JSON.stringify(summary, null, 2)}\n`); console.log(JSON.stringify(summary, null, 2))
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
