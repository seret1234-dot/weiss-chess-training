import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BATCH1_ENGINE, BATCH1_STATUS, BATCH1_THEMES, FixedDepthStockfish18, validateBatch1Record } from './lib/pattern-tactic-batch1-semantic.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(root, 'public', 'data', 'pattern-tactics')
const auditPath = path.join(root, 'audit-reports', 'pattern-tactic-batch1-semantic.json')
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const puzzles = (value) => Array.isArray(value) ? value : value?.puzzles ?? []
const report = { generatedBy: 'npm run audit:pattern-tactic-batch1-semantics', engine: BATCH1_ENGINE, courses: [], records: [] }
const engine = new FixedDepthStockfish18()

await engine.init()
try {
  for (const theme of BATCH1_THEMES) {
    for (const stage of [1, 2, 3, 4]) {
      const sourceDir = path.join(sourceRoot, theme, `m${stage}`)
      const manifestPath = path.join(sourceDir, 'manifest.json')
      if (!fs.existsSync(manifestPath)) continue
      const manifest = read(manifestPath)
      const counts = Object.fromEntries(Object.values(BATCH1_STATUS).map((status) => [status, 0]))
      let sourceRecords = 0
      for (const sourceFile of manifest.files) {
        const entries = puzzles(read(path.join(sourceDir, sourceFile)))
        for (let sourceIndex = 0; sourceIndex < entries.length; sourceIndex += 1) {
          const raw = entries[sourceIndex]
          const audit = await validateBatch1Record(raw, theme, engine)
          counts[audit.status] += 1
          sourceRecords += 1
          report.records.push({
            theme, stage, sourceFile, sourceIndex,
            sourceIdentity: String(raw.puzzleId ?? raw.id ?? `${sourceFile}:${sourceIndex}`),
            fen: raw.fen ?? raw.FEN ?? null,
            storedLine: audit.replay?.activeLine ?? raw.solutionLine ?? raw.moves ?? [],
            status: audit.status, reason: audit.reason,
            evidence: audit.evidence ?? null,
            bestDefense: audit.engine ?? null,
          })
        }
      }
      report.courses.push({ theme, stage, sourceRecords, counts })
      console.log(`${theme} M${stage}: ${JSON.stringify(counts)}`)
    }
  }
} finally {
  engine.quit()
}

fs.mkdirSync(path.dirname(auditPath), { recursive: true })
fs.writeFileSync(auditPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Wrote ${auditPath}`)
