import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { BATCH1_THEMES, validateBatch1Record } from './lib/pattern-tactic-batch1-semantic.mjs'

const root = process.cwd()
const dataRoot = path.join(root, 'public', 'data', 'learner-curricula', 'pattern-tactics')
const auditPath = path.join(root, 'audit-reports', 'pattern-tactic-batch1-semantic.json')
assert.ok(fs.existsSync(auditPath), 'Batch 1 audit is required locally; regenerate with npm run audit:pattern-tactic-batch1-semantics')
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))
const list = (value) => Array.isArray(value) ? value : value?.puzzles ?? []
const approved = new Map(audit.records.filter((record) => record.status === 'VALID').map((record) => [`${record.theme}|${record.sourceIdentity}`, record]))
const unavailableReason = 'Not enough reviewed material is available for this course yet.'
const expectedActive = new Map([['hanging-piece-m4', { retained: 23, chunks: 2 }]])

for (const theme of BATCH1_THEMES) for (const stage of [1, 2, 3, 4]) {
  const key = `${theme}-m${stage}`
  const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, `${key}-semantic-v5`, 'manifest.json'), 'utf8'))
  const active = expectedActive.get(key)
  assert.equal(Boolean(manifest.unavailable), !active, `${key} fails closed below the 20-record floor`)
  assert.equal(manifest.totalPuzzles, active?.retained ?? 0, `${key} retained count is deterministic`)
  assert.equal(manifest.totalChunks, active?.chunks ?? 0, `${key} learner chunk count is capped`)
  assert.ok(manifest.totalChunks <= (stage === 1 ? 5 : 8), `${key} respects the learner chunk cap`)
  if (!active) {
    assert.equal(manifest.unavailableReason, unavailableReason, `${key} has an explicit unavailable state`)
    assert.deepEqual(manifest.files, [], `${key} cannot serve raw fallback files`)
    continue
  }
  const canonical = new Set()
  for (const file of manifest.files) for (const puzzle of list(JSON.parse(fs.readFileSync(path.join(dataRoot, `${key}-semantic-v5`, file), 'utf8')))) {
    assert.equal(puzzle.semanticAudit?.status, 'VALID', `${key} keeps only VALID records`)
    assert.equal(puzzle.canonicalThemeKey, theme, `${key} preserves canonical theme authority`)
    assert.ok(Array.isArray(puzzle.semanticAudit?.evidence?.highlightSquares) && puzzle.semanticAudit.evidence.highlightSquares.length > 0, `${key} serializes verified highlight squares`)
    assert.equal(canonical.has(puzzle.learnerCurriculum?.canonicalIdentity), false, `${key} has no duplicate canonical exercise`)
    canonical.add(puzzle.learnerCurriculum?.canonicalIdentity)
    const auditRecord = approved.get(`${theme}|${puzzle.learnerCurriculum?.sourceIdentity}`)
    assert.ok(auditRecord, `${key} overlay record is present in the fixed-depth VALID audit`)
    const engine = { evaluate: async () => auditRecord.bestDefense }
    const verdict = await validateBatch1Record(puzzle, theme, engine)
    assert.equal(verdict.status, 'VALID', `${key} active record still passes its dedicated validator`)
  }
}

for (const stage of [1, 2, 3, 4]) {
  const prior = JSON.parse(fs.readFileSync(path.join(dataRoot, `mixed-m${stage}-semantic-v4`, 'manifest.json'), 'utf8'))
  const mixedDir = path.join(dataRoot, `mixed-m${stage}-semantic-v5`)
  const mixed = JSON.parse(fs.readFileSync(path.join(mixedDir, 'manifest.json'), 'utf8'))
  const puzzles = list(JSON.parse(fs.readFileSync(path.join(mixedDir, 'chunk-001.json'), 'utf8')))
  for (const theme of prior.sourceThemes) assert.ok(mixed.sourceThemes.includes(theme), `mixed M${stage} retains approved ${theme} contribution`)
  assert.equal(mixed.sourceThemes.filter((theme) => BATCH1_THEMES.includes(theme)).join(','), stage === 4 ? 'hanging-piece' : '', `mixed M${stage} includes only active Batch 1 themes`)
  assert.equal(mixed.contributionCounts['hanging-piece'] ?? 0, stage === 4 ? 23 : 0, `mixed M${stage} uses the reviewed hanging-piece overlay only where available`)
  assert.equal(puzzles.some((puzzle) => /-v1\b/.test(String(puzzle.learnerCurriculum?.version ?? ''))), false, `mixed M${stage} has no raw v1 contributor`)
  assert.equal(puzzles.some((puzzle) => puzzle.semanticAudit?.status !== 'VALID'), false, `mixed M${stage} has only approved records`)
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const curriculum = await vite.ssrLoadModule('/src/trainers/patternTactic/m1toM4LearnerCurriculum.ts')
  const active = curriculum.getPatternTacticLearnerCurriculum('tactic-hanging-piece-m4')
  assert.equal(active.activeChunkCount, 2, 'Hanging Piece M4 is restored with its two reviewed chunks')
  assert.match(active.learnerDataBasePath, /hanging-piece-m4-semantic-v5$/, 'the restored course loads the v5 overlay')
  for (const theme of BATCH1_THEMES) for (const stage of [1, 2, 3, 4]) {
    const definition = curriculum.getPatternTacticLearnerCurriculum(`tactic-${theme}-m${stage}`)
    if (theme === 'hanging-piece' && stage === 4) continue
    assert.equal(definition.activeChunkCount, 0, `${theme} M${stage} is unavailable and cannot schedule raw content`)
  }
  const rows = [{ trainer_key: active.trainerKey, chunk_index: 1, is_mastered: true, mastered_puzzles_count: 30 }]
  assert.deepEqual(curriculum.getPatternTacticLearnerCompletionByTrainer(rows)[active.trainerKey], curriculum.getPatternTacticLearnerCompletionByTrainer(rows)[active.trainerKey], 'legacy progress conversion is deterministic')
} finally {
  await vite.close()
}

const trainer = fs.readFileSync(path.join(root, 'src', 'trainers', 'patternTactic', 'PatternTacticTrainer.tsx'), 'utf8')
assert.match(trainer, /mixed-m\$\{tacticDistance\}-semantic-v5/, 'trainer loads the current approved mixed overlay')
assert.match(trainer, /explicitSquares/, 'trainer renders validator-proven explicit highlight squares after disclosure')
assert.doesNotMatch(trainer, /isCheckmate\(\).*alternative/i, 'tactic solution acceptance remains strict to stored solutions')

console.log('PASS: Batch 1 semantic-v5 overlays fail closed, restore only reviewed Hanging Piece M4, and preserve approved mixed contributors')
