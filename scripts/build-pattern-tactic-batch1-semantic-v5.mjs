import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BATCH1_THEMES } from './lib/pattern-tactic-batch1-semantic.mjs'
import { canonicalIdentity } from './lib/pattern-tactic-semantic-validator.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(root, 'public', 'data', 'pattern-tactics')
const learnerRoot = path.join(root, 'public', 'data', 'learner-curricula', 'pattern-tactics')
const auditPath = path.join(root, 'audit-reports', 'pattern-tactic-batch1-semantic.json')
const reviewPath = path.join(root, 'docs', 'reviews', 'pattern-tactic-batch1-semantic-v5.md')
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`) }
const list = (value) => Array.isArray(value) ? value : value?.puzzles ?? []
const label = (theme) => ({ 'attacking-f2-f7': 'Attacking f2/f7', 'hanging-piece': 'Hanging Piece', 'trapped-piece': 'Trapped Piece', 'remove-the-defender': 'Removal of Defender', 'bishop-xray': 'Bishop X-Ray', 'queen-xray': 'Queen X-Ray', 'rook-xray': 'Rook X-Ray', 'other-xray': 'Other X-Ray' }[theme] ?? theme.split('-').map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(' '))
const hash = (value) => { let h = 2166136261; for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
const auditBySource = new Map(audit.records.map((record) => [`${record.theme}-m${record.stage}|${record.sourceFile}|${record.sourceIndex}`, record]))
const courses = []

for (const course of audit.courses) {
  const key = `${course.theme}-m${course.stage}`
  const sourceDir = path.join(sourceRoot, course.theme, `m${course.stage}`)
  const sourceManifest = read(path.join(sourceDir, 'manifest.json'))
  const valid = []
  sourceManifest.files.forEach((sourceFile, sourceChunkIndex) => list(read(path.join(sourceDir, sourceFile))).forEach((raw, sourceIndex) => {
    const record = auditBySource.get(`${key}|${sourceFile}|${sourceIndex}`)
    if (record?.status === 'VALID') valid.push({ raw, sourceFile, sourceChunk: sourceChunkIndex + 1, sourceIndex, record })
  }))
  valid.sort((a, b) => hash(`${key}|${a.record.sourceIdentity}`) - hash(`${key}|${b.record.sourceIdentity}`) || a.record.sourceIdentity.localeCompare(b.record.sourceIdentity))
  const cap = course.stage === 1 ? 100 : 160
  const retained = valid.slice(0, cap)
  const available = retained.length >= 20
  const selected = available ? retained : []
  const chunks = Math.ceil(selected.length / 20)
  const outputDir = path.join(learnerRoot, `${course.theme}-m${course.stage}-semantic-v5`)
  fs.rmSync(outputDir, { recursive: true, force: true })
  const files = []
  for (let chunk = 0; chunk < chunks; chunk += 1) {
    const file = `chunk-${String(chunk + 1).padStart(3, '0')}.json`
    files.push(file)
    write(path.join(outputDir, file), { puzzles: selected.slice(chunk * 20, (chunk + 1) * 20).map((entry, order) => ({
      ...entry.raw,
      canonicalThemeKey: course.theme,
      canonicalThemeLabel: label(course.theme),
      semanticAudit: { version: 'batch1-semantic-v5', status: 'VALID', reason: entry.record.reason, evidence: entry.record.evidence },
      learnerCurriculum: { version: `m${course.stage}-semantic-v5`, tacticDistance: course.stage, learnerChunk: chunk + 1, orderInChunk: order, sourceChunk: entry.sourceChunk, sourceIndex: entry.sourceIndex, sourceIdentity: entry.record.sourceIdentity, canonicalIdentity: canonicalIdentity(entry.raw, course.theme), retainedReason: 'Batch 1 fixed-depth Stockfish 18 best-defense proof plus dedicated semantic validator.' },
    })) })
  }
  write(path.join(outputDir, 'manifest.json'), {
    schemaVersion: 1, curriculumVersion: `pattern-tactic-${course.theme}-m${course.stage}-semantic-v5`, category: 'tactics', theme: course.theme,
    canonicalThemeKey: course.theme, canonicalThemeLabel: label(course.theme), tacticDistance: course.stage, totalPuzzles: selected.length, totalChunks: chunks, chunkSize: 20, files,
    unavailable: !available, unavailableReason: !available ? 'Not enough reviewed material is available for this course yet.' : undefined,
    sourceManifest: `/data/pattern-tactics/${course.theme}/m${course.stage}/manifest.json`, semanticCounts: { ...course.counts, retained: selected.length, unusedValid: Math.max(0, valid.length - retained.length) },
    validation: { version: 'batch1-semantic-v5', engine: audit.engine, policy: 'VALID only; ambiguous, misclassified, and broken records are excluded.' },
    legacyMapping: 'Legacy progress rows remain immutable and map proportionally through the existing learner-curriculum compatibility layer.',
  })
  courses.push({ ...course, retained: selected.length, chunks, unavailable: !available })
}

for (const stage of [1, 2, 3, 4]) {
  // semantic-v4 is the approved mixed baseline. Preserve every contributor
  // it already selected and replace only newly reviewed Batch 1 theme pools.
  const priorMixedDir = path.join(learnerRoot, `mixed-m${stage}-semantic-v4`)
  const priorMixed = read(path.join(priorMixedDir, 'manifest.json'))
  const priorPuzzles = (priorMixed.files ?? []).flatMap((file) => list(read(path.join(priorMixedDir, file))))
  const sourceThemes = new Set((priorMixed.sourceThemes ?? []).filter((theme) => !BATCH1_THEMES.includes(theme)))
  const contributionCounts = {}
  const puzzles = priorPuzzles.filter((puzzle) => !BATCH1_THEMES.includes(String(puzzle.canonicalThemeKey ?? puzzle.sourceTheme ?? '')))
  for (const theme of sourceThemes) contributionCounts[theme] = puzzles.filter((puzzle) => String(puzzle.canonicalThemeKey ?? puzzle.sourceTheme ?? '') === theme).length
  for (const theme of BATCH1_THEMES) {
    const manifestPath = path.join(learnerRoot, `${theme}-m${stage}-semantic-v5`, 'manifest.json')
    const manifest = read(manifestPath)
    if (manifest.unavailable) continue
    const directory = path.dirname(manifestPath)
    const entries = (manifest.files ?? []).flatMap((file) => list(read(path.join(directory, file))))
      .map((puzzle) => ({ ...puzzle, canonicalThemeKey: theme, canonicalThemeLabel: label(theme) }))
    puzzles.push(...entries)
    sourceThemes.add(theme)
    contributionCounts[theme] = entries.length
  }
  const mixedDir = path.join(learnerRoot, `mixed-m${stage}-semantic-v5`)
  write(path.join(mixedDir, 'chunk-001.json'), { puzzles })
  write(path.join(mixedDir, 'manifest.json'), { schemaVersion: 1, curriculumVersion: `pattern-tactic-mixed-m${stage}-semantic-v5`, category: 'tactics', theme: 'mixed', tacticDistance: stage, totalPuzzles: puzzles.length, totalChunks: 1, chunkSize: puzzles.length, files: ['chunk-001.json'], sourceThemes: [...sourceThemes].sort(), contributionCounts: Object.fromEntries(Object.entries(contributionCounts).sort(([a], [b]) => a.localeCompare(b))), note: 'Batch 1 contributors use semantic-v5; all remaining contributors retain the existing approved semantic-v4 selections. Raw v1 never re-enters mixed practice.' })
}

const lines = ['# Pattern Tactic Batch 1 semantic-v5 review', '', 'Generated by `npm run build:pattern-tactic-batch1-semantic-v5` after `npm run audit:pattern-tactic-batch1-semantics`.', '', '| Theme | Stage | Source | Valid | Ambiguous | Misclassified | Broken | Retained | Chunks | Unavailable |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|']
for (const course of courses) lines.push(`| ${label(course.theme)} | M${course.stage} | ${course.sourceRecords} | ${course.counts.VALID} | ${course.counts.AMBIGUOUS} | ${course.counts.MISCLASSIFIED} | ${course.counts.BROKEN} | ${course.retained} | ${course.chunks} | ${course.unavailable ? 'yes' : 'no'} |`)
lines.push('', '## Examples', '')
for (const theme of BATCH1_THEMES) {
  lines.push(`### ${label(theme)}`)
  const records = audit.records.filter((record) => record.theme === theme)
  const accepted = records.filter((record) => record.status === 'VALID').slice(0, 10)
  const rejected = records.filter((record) => record.status !== 'VALID').slice(0, 10)
  lines.push(`Accepted examples: ${accepted.length} shown (${records.filter((record) => record.status === 'VALID').length} total). Rejected examples: ${rejected.length} shown.`, '')
  for (const [heading, examples] of [['Accepted', accepted], ['Rejected', rejected]]) {
    lines.push(`#### ${heading}`)
    if (examples.length === 0) lines.push('- None met this category in the reviewed source pool.')
    for (const record of examples) {
      const evidence = record.evidence ?? {}
      const bestDefense = record.bestDefense?.bestMove ?? evidence.bestDefense ?? evidence.bestDefensePv ?? 'Not established'
      const pv = record.bestDefense?.pv ?? evidence.stockfishPv ?? evidence.pv ?? 'Not established'
      const result = evidence.concreteResult ?? evidence.materialResult ?? 'Not established'
      lines.push(`- ${record.status}: ${record.sourceIdentity}; FEN \`${record.fen}\`; line \`${record.storedLine.join(' ')}\`; best defense \`${typeof bestDefense === 'string' ? bestDefense : JSON.stringify(bestDefense)}\`; Stockfish PV \`${typeof pv === 'string' ? pv : JSON.stringify(pv)}\`; result \`${typeof result === 'string' ? result : JSON.stringify(result)}\`; ${record.reason}; explanation: ${evidence.explanation ?? 'No learner explanation (rejected).'}`)
    }
    lines.push('')
  }
  lines.push('')
}
while (lines.at(-1) === '') lines.pop()
fs.writeFileSync(reviewPath, `${lines.join('\n')}\n`)
console.log(JSON.stringify(courses, null, 2))
