import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const root = process.cwd(), local = path.join(root, '.local-verified-lichess-tactics-v1')
const structural = path.join(local, 'hanging-m1-structural-v1.ndjson')
const legacyRejected = path.join(local, 'b3-hanging-r3.ndjson')
const auditPath = path.join(local, 'hanging-m1-structural-v1-safety-audit.md')
const poolPath = path.join(local, 'hanging-m1-stockfish-v1-pool.json')
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const stable = (value) => hash(value).slice(0, 16)
const read = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse)
const bands = (rating) => Math.min(4, Math.floor(Math.max(0, rating - 400) / 400))
const pickBalanced = (records, total) => {
  const usedFamilies = new Set(), selected = [], sorted = [...records].sort((a, b) => stable(a.source.sourcePuzzleId).localeCompare(stable(b.source.sourcePuzzleId)))
  const seen = new Set()
  for (const record of sorted) {
    if (selected.length === total) break
    const e = record.candidate.evidence, key = `${e.subtype}|${e.targetPiece}|${e.attackerPiece}|${bands(record.source.rating)}|${e.givesCheck}|${record.candidate.exactSymmetryFamilyId}`
    if (usedFamilies.has(record.candidate.exactSymmetryFamilyId) || seen.has(key)) continue
    usedFamilies.add(record.candidate.exactSymmetryFamilyId); seen.add(key); selected.push(record)
  }
  for (const record of sorted) {
    if (selected.length === total) break
    if (usedFamilies.has(record.candidate.exactSymmetryFamilyId)) continue
    usedFamilies.add(record.candidate.exactSymmetryFamilyId); selected.push(record)
  }
  return selected
}
const describe = (record) => {
  const { source, candidate } = record, e = candidate.evidence
  return `| ${source.sourcePuzzleId} | ${source.rating} | \`${source.displayedFen}\` | \`${e.learnerMove}\` | ${e.attackerPiece} | ${e.targetPiece} on ${e.targetSquare} | ${e.targetDefendersBefore.map((d) => `${d.piece}@${d.square}`).join(', ') || 'none'} | ${e.immediateLegalRecaptures.map((m) => m.san).join(', ') || 'none'} | ${e.immediateMaterialDelta >= 0 ? '+' : ''}${e.immediateMaterialDelta} | ${e.givesCheck ? 'yes' : 'no'} | ${e.subtype} |`
}
async function rejectedSamples() {
  if (!fs.existsSync(legacyRejected)) return []
  const found = []
  const lines = readline.createInterface({ input: fs.createReadStream(legacyRejected), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line) continue
    const row = JSON.parse(line), reason = row.finding?.reason ?? ''
    if (!reason.startsWith('mate-primary:') && !reason.startsWith('other-primary-motif:')) continue
    found.push({ id: row.source?.sourcePuzzleId, rating: row.source?.rating, fen: row.source?.displayedFen, move: row.finding?.evidence?.captureMove ?? null, reason })
    if (found.length === 100) break
  }
  return found
}
const records = read(structural)
const free = records.filter((entry) => entry.candidate.evidence.subtype === 'Free Piece')
const defended = records.filter((entry) => entry.candidate.evidence.subtype === 'Insufficiently Defended')
const primary = [...pickBalanced(free, 75), ...pickBalanced(defended, 25)]
const primaryIds = new Set(primary.map((entry) => entry.source.sourcePuzzleId))
const reserve = [...pickBalanced(free.filter((entry) => !primaryIds.has(entry.source.sourcePuzzleId)), 25), ...pickBalanced(defended.filter((entry) => !primaryIds.has(entry.source.sourcePuzzleId)), 25)]
if (primary.length !== 100 || reserve.length !== 50) throw new Error(`insufficient balanced pool ${primary.length}/${reserve.length}`)
const rejected = await rejectedSamples()
const lines = ['# Hanging Piece M1 structural safety audit', '', 'This review treats a loose piece already present in the displayed position as the intended M1 board-awareness lesson. Source tags are diagnostic only. Every selected record still requires individual Stockfish validation.', '', `- Structural candidates: ${records.length} (${free.length} Free Piece; ${defended.length} Insufficiently Defended ENGINE_REQUIRED).`, `- Stockfish pool: ${primary.length} primary and ${reserve.length} reserves, all unique source IDs and exact-symmetry families.`, `- Historical rejected control rows: ${rejected.length} (mate/other-primary exclusions from the prior tag-restricted R3 audit; shown only to verify that reward-cleanup patterns are not reused).`, '', '## Free Piece sample (100)', '', '| Puzzle | Rating | Displayed FEN | Learner capture | Capturer | Target | Defenders | Immediate recapture | Material delta | Check | Subtype |', '|---|---:|---|---|---|---|---|---|---:|---|---|', ...pickBalanced(free, 100).map(describe), '', '## Insufficiently Defended sample (100)', '', '| Puzzle | Rating | Displayed FEN | Learner capture | Capturer | Target | Defenders | Immediate recapture | Material delta | Check | Subtype |', '|---|---:|---|---|---|---|---|---|---:|---|---|', ...pickBalanced(defended, 100).map(describe), '', '## Rejected competing-primary control sample', '', '| Puzzle | Rating | Displayed FEN | Candidate move | Exclusion |', '|---|---:|---|---|---|', ...rejected.map((row) => `| ${row.id ?? 'unknown'} | ${row.rating ?? 'unknown'} | \`${row.fen ?? 'unknown'}\` | \`${row.move ?? 'unknown'}\` | ${row.reason} |`), '']
fs.writeFileSync(auditPath, `${lines.join('\n')}\n`)
const pool = { version: 'verified-lichess-hanging-m1-stockfish-v1', sourceFingerprint: '4f37f497a245384d6d37c81c5b3d14ab7d62772fe8f95bd0edadf87763c54852', selection: { primary, reserve }, jobs: [...primary, ...reserve], uniqueJobs: 150, poolHash: hash(JSON.stringify([...primary, ...reserve].map((entry) => entry.source.sourcePuzzleId))) }
fs.writeFileSync(poolPath, `${JSON.stringify(pool, null, 2)}\n`)
console.log(JSON.stringify({ auditPath, poolPath, free: free.length, insufficientlyDefended: defended.length, primary: primary.length, reserve: reserve.length, poolHash: pool.poolHash, rejectedControls: rejected.length }, null, 2))
