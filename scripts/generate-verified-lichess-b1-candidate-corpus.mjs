import fs from 'node:fs'
import path from 'node:path'
import { Chess } from 'chess.js'

const root = process.cwd()
const audit = path.join(root, 'audit-reports/verified-lichess-tactics-v1')
const local = path.join(root, '.local-verified-lichess-tactics-v1', 'candidate-corpus-v1')
const pool = JSON.parse(fs.readFileSync(path.join(audit, 'exhaustive-b1-validation-pool.json'), 'utf8'))
const engineRows = fs.readFileSync(path.join(root, '.local-verified-lichess-tactics-v1', 'b1-stockfish-v2-results.ndjson'), 'utf8').trim().split(/\r?\n/).map(JSON.parse)
const sourceFingerprint = '4f37f497a245384d6d37c81c5b3d14ab7d62772fe8f95bd0edadf87763c54852'
const courses = [
  ['Promotion:M1', 100, 5], ['Promotion:M2', 160, 8],
  ['Knight Underpromotion:M1', 100, 5], ['Knight Underpromotion:M2', 160, 8],
  ['En Passant:M1', 100, 5], ['En Passant:M2', 160, 8]
]
const rich = new Map()
for (const selection of Object.values(pool.selections)) for (const bucket of ['primary', 'reserve']) for (const item of selection[bucket]) rich.set(`${item.source.sourcePuzzleId}|${item.finding.key}`, item)
const engine = new Map()
for (const row of engineRows) for (const finding of row.findings) engine.set(`${row.sourcePuzzleId}|${finding.finding.key}`, { row, finding })
const replay = (source) => { const game = new Chess(source.displayedFen); for (const uci of source.sourceM2Line) { const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }); if (!move) throw new Error(`illegal ${source.sourcePuzzleId} ${uci}`) } }
const hash = (value) => { let h = 2166136261; for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619) } return (h >>> 0).toString(16).padStart(8, '0') }
const used = new Set(), manifests = [], courseRecords = new Map()
fs.rmSync(local, { recursive: true, force: true }); fs.mkdirSync(local, { recursive: true })
for (const [name, cap, chunkCount] of courses) {
  const selection = pool.selections[name], picked = [], contribution = { primary: 0, reserve: 0 }
  for (const bucket of ['primary', 'reserve']) for (const item of selection[bucket]) {
    if (picked.length === cap || used.has(item.source.sourcePuzzleId)) continue
    const result = engine.get(`${item.source.sourcePuzzleId}|${item.finding.key}`)
    if (!result || result.finding.status !== 'APPROVED') continue
    replay(item.source); used.add(item.source.sourcePuzzleId); contribution[bucket]++
    const f = item.finding, e = f.evidence
    picked.push({ id: `verified-lichess-b1-v1-${hash(`${name}|${item.source.sourcePuzzleId}|${e.promotionMove ?? e.captureMove}`)}`, lichessPuzzleId: item.source.sourcePuzzleId, sourceFingerprint, displayedFen: item.source.displayedFen, completeMoveSequence: item.source.sourceM2Line, learnerMoves: item.source.sourceM2Line.filter((_, index) => index % 2 === 0), opponentReplies: item.source.sourceM2Line.filter((_, index) => index % 2 === 1), learnerStage: f.extraction, canonicalTheme: f.label, canonicalSubtype: f.canonicalSubtype, checking: Boolean(e.givesCheck), capture: Boolean(e.capture), tacticalResult: e.centralityReason ?? 'verified tactical result', rating: item.source.rating, sourceMetadata: { rawLichessTags: item.source.rawLichessTags, popularity: item.source.popularity, playCount: item.source.playCount }, exactSymmetryFamilyId: f.exactSymmetryFamilyId, structuralValidation: f.status, engineValidation: { outcome: result.finding.status, reason: result.finding.reason, configuration: result.row.config, outputIdentity: `${item.source.sourcePuzzleId}|${f.key}`, underpromotion: result.finding.underpromotion ?? null }, queenComparison: f.candidateCategory === 'underpromotion' ? 'stable-superior-at-depths-12-and-14' : null, selection: bucket, secondaryThemes: item.source.rawLichessTags.includes('enPassant') && f.label === 'Promotion' ? ['En Passant'] : item.source.rawLichessTags.includes('promotion') && f.label === 'En Passant' ? ['Promotion'] : [] })
  }
  if (picked.length !== cap) throw new Error(`${name} has ${picked.length}/${cap}`)
  const dir = path.join(local, name.replace(/[: ]/g, '-').toLowerCase()); fs.mkdirSync(dir, { recursive: true })
  const chunks = Array.from({ length: chunkCount }, (_, index) => ({ id: `${name.replace(/[: ]/g, '-').toLowerCase()}-chunk-${index + 1}`, records: picked.slice(index * 20, index * 20 + 20) }))
  for (const chunk of chunks) fs.writeFileSync(path.join(dir, `${chunk.id}.json`), `${JSON.stringify(chunk, null, 2)}\n`)
  const manifest = { course: name, cap, chunkCount, contribution, chunks: chunks.map(({ id, records }) => ({ id, count: records.length, file: `${id}.json` })) }
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`); manifests.push(manifest); courseRecords.set(name, picked)
}
const output = { version: 'verified-lichess-b1-candidate-corpus-v1', sourceFingerprint, records: 780, manifests }
fs.writeFileSync(path.join(local, 'index.json'), `${JSON.stringify(output, null, 2)}\n`)
const lines = ['# Verified Lichess B1 candidate corpus review', '', `Source fingerprint: \`${sourceFingerprint}\``, '']
for (const manifest of manifests) {
  const records = courseRecords.get(manifest.course), ratings = records.map((record) => record.rating).sort((a, b) => a - b)
  const checks = records.filter((record) => record.checking).length, captures = records.filter((record) => record.capture).length
  const results = Object.fromEntries(records.reduce((map, record) => map.set(record.tacticalResult, (map.get(record.tacticalResult) ?? 0) + 1), new Map()))
  lines.push(`## ${manifest.course}`, '', `- ${records.length} records; ${manifest.chunkCount} chunks; primary/reserve ${manifest.contribution.primary}/${manifest.contribution.reserve}; exact-symmetry families ${new Set(records.map((record) => record.exactSymmetryFamilyId)).size}.`, `- Rating: ${ratings[0]}–${ratings.at(-1)}, median ${ratings[Math.floor((ratings.length - 1) / 2)]}; checking/non-checking ${checks}/${records.length - checks}; capture/non-capture ${captures}/${records.length - captures}.`, `- Tactical results: ${Object.entries(results).map(([key, value]) => `${value} ${key}`).join('; ')}.`, '', '| Puzzle ID | Rating | Displayed FEN | Learner line | Check | Capture | Result | Engine |', '|---|---:|---|---|---|---|---|---|')
  for (const record of records.slice(0, 10)) lines.push(`| ${record.lichessPuzzleId} | ${record.rating} | \`${record.displayedFen}\` | \`${record.completeMoveSequence.join(' ')}\` | ${record.checking} | ${record.capture} | ${record.tacticalResult} | ${record.engineValidation.outcome} |`)
  lines.push('')
}
fs.writeFileSync(path.join(local, 'review.md'), `${lines.join('\n')}\n`)
console.log(JSON.stringify({ directory: local, records: 780, manifests }, null, 2))
