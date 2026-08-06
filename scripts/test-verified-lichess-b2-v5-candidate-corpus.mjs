import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
const local = path.join(process.cwd(), '.local-verified-lichess-tactics-v1', 'b2-v5-candidate-corpus-v1')
const index = JSON.parse(fs.readFileSync(path.join(local, 'index.json'), 'utf8'))
const sourceIds = new Set(), exerciseIds = new Set()
for (const manifest of Object.values(index.manifests)) {
  let counted = 0; const families = new Set()
  for (const chunk of manifest.chunks) { const rows = JSON.parse(fs.readFileSync(path.join(local, manifest.course, chunk.file), 'utf8')).records; assert.equal(rows.length, chunk.count); counted += rows.length; for (const row of rows) { assert.equal(row.engineComparison.outcome, 'APPROVED'); assert.equal(sourceIds.has(row.sourcePuzzleId), false); assert.equal(exerciseIds.has(row.id), false); assert.equal(families.has(row.exactSymmetryFamilyId), false); sourceIds.add(row.sourcePuzzleId); exerciseIds.add(row.id); families.add(row.exactSymmetryFamilyId) } }
  assert.equal(counted, manifest.recordCount); assert.ok(counted >= 20)
}
assert.equal(index.records, sourceIds.size)
console.log('B2 V5 local candidate corpus tests passed')
