import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { canonicalIdentity, getValidatorTier, puzzleArray, storedLine, validateTacticRecord } from "./lib/pattern-tactic-semantic-validator.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceRoot = path.join(root, "public", "data", "pattern-tactics")
const learnerRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const auditRoot = path.join(root, "audit-reports")
const reviewRoot = path.join(root, "docs", "reviews")
const statuses = ["VALID", "VALID BUT WEAK", "AMBIGUOUS", "MISCLASSIFIED", "BROKEN / ILLEGAL"]

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")) }
function title(value) { return value.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ") }
function route(theme, stage) { return `/tactics/m${stage}/${theme}` }
function push(map, key, value = 1) { map.set(key, (map.get(key) ?? 0) + value) }
function sourceId(raw, fallback) { return String(raw.puzzleId ?? raw.lichessId ?? raw.lichess_id ?? raw.PuzzleId ?? raw.id ?? fallback) }

function auditCourse({ dataset, theme, stage, sourceDir, manifest, learner }) {
  const records = []
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]))
  const confusion = new Map()
  manifest.files.forEach((file, chunkOffset) => {
    const items = puzzleArray(readJson(path.join(sourceDir, file)))
    items.forEach((raw, index) => {
      const result = validateTacticRecord(raw, theme)
      counts[result.status] += 1
      push(confusion, result.detectedTheme ?? "unknown")
      records.push({
        dataset,
        declaredTheme: theme,
        stage: `m${stage}`,
        route: route(theme, stage),
        puzzleId: sourceId(raw, `${theme}-m${stage}-${chunkOffset + 1}-${index}`),
        sourceChunk: learner?.sourceChunk ?? chunkOffset + 1,
        sourceIndex: learner?.sourceIndex ?? index,
        learnerChunk: learner?.learnerChunk ?? null,
        fen: result.displayedFen,
        storedLine: result.activeLine.length ? result.activeLine : storedLine(raw),
        canonicalIdentity: learner?.canonicalIdentity ?? canonicalIdentity(raw, theme),
        rawTags: raw.rawTags ?? raw.themes ?? raw.theme ?? [],
        status: result.status,
        confidence: result.confidence,
        tier: result.tier,
        reason: result.reason,
        detectedTheme: result.detectedTheme ?? "unknown",
        evidence: result.evidence,
      })
    })
  })
  const total = records.length
  return { dataset, theme, stage, total, counts, confusion, records, falsePositivePercent: Number((((counts.MISCLASSIFIED + counts["BROKEN / ILLEGAL"]) / Math.max(total, 1)) * 100).toFixed(2)) }
}

const courses = []
for (const theme of fs.readdirSync(sourceRoot).filter((entry) => entry !== "mixed").sort()) {
  for (const stage of [1, 2, 3, 4]) {
    const sourceDir = path.join(sourceRoot, theme, `m${stage}`)
    const manifestFile = path.join(sourceDir, "manifest.json")
    if (!fs.existsSync(manifestFile)) continue
    const manifest = readJson(manifestFile)
    courses.push(auditCourse({ dataset: "source", theme, stage, sourceDir, manifest }))
    const learnerDir = path.join(learnerRoot, `${theme}-m${stage}-v1`)
    const learnerManifestFile = path.join(learnerDir, "manifest.json")
    if (fs.existsSync(learnerManifestFile)) {
      const learnerManifest = readJson(learnerManifestFile)
      const learnerRecords = []
      learnerManifest.files.forEach((file, learnerChunk) => {
        puzzleArray(readJson(path.join(learnerDir, file))).forEach((raw, index) => learnerRecords.push({ raw, learnerChunk, index }))
      })
      const counts = Object.fromEntries(statuses.map((status) => [status, 0]))
      const confusion = new Map()
      const records = learnerRecords.map(({ raw, learnerChunk, index }) => {
        const result = validateTacticRecord(raw, theme)
        counts[result.status] += 1; push(confusion, result.detectedTheme ?? "unknown")
        const learner = raw.learnerCurriculum
        return {
          dataset: "learner", declaredTheme: theme, stage: `m${stage}`, route: route(theme, stage),
          puzzleId: sourceId(raw, `${theme}-m${stage}-learner-${learnerChunk + 1}-${index}`), sourceChunk: learner?.sourceChunk ?? null, sourceIndex: learner?.sourceIndex ?? null,
          learnerChunk: learnerChunk + 1, fen: result.displayedFen, storedLine: result.activeLine.length ? result.activeLine : storedLine(raw),
          canonicalIdentity: learner?.canonicalIdentity ?? canonicalIdentity(raw, theme), rawTags: raw.rawTags ?? raw.themes ?? raw.theme ?? [],
          status: result.status, confidence: result.confidence, tier: result.tier, reason: result.reason, detectedTheme: result.detectedTheme ?? "unknown", evidence: result.evidence,
        }
      })
      const total = records.length
      courses.push({ dataset: "learner", theme, stage, total, counts, confusion, records, falsePositivePercent: Number((((counts.MISCLASSIFIED + counts["BROKEN / ILLEGAL"]) / Math.max(total, 1)) * 100).toFixed(2)) })
    }
  }
}

const allRecords = courses.flatMap((course) => course.records)
const matrix = new Map()
for (const record of allRecords) push(matrix, `${record.dataset}|${record.declaredTheme}|${record.detectedTheme}`)
const sourceCourses = courses.filter((course) => course.dataset === "source")
const learnerCourses = courses.filter((course) => course.dataset === "learner")
const worst = [...courses].sort((a, b) => (b.falsePositivePercent - a.falsePositivePercent) || ((b.counts.AMBIGUOUS ?? 0) - (a.counts.AMBIGUOUS ?? 0)) || a.theme.localeCompare(b.theme)).slice(0, 30)
const failures = allRecords.filter((record) => ["MISCLASSIFIED", "BROKEN / ILLEGAL", "VALID BUT WEAK", "AMBIGUOUS"].includes(record.status))
const examples = Object.fromEntries(statuses.map((status) => [status, allRecords.filter((record) => record.status === status).slice(0, 12)]))
const coursesByTheme = new Map()
for (const course of sourceCourses) push(coursesByTheme, course.theme)

const report = {
  generatedAt: new Date(0).toISOString(),
  deterministic: true,
  scope: { sourceCourses: sourceCourses.length, learnerCourses: learnerCourses.length, sourceRecords: sourceCourses.reduce((sum, course) => sum + course.total, 0), learnerRecords: learnerCourses.reduce((sum, course) => sum + course.total, 0) },
  validatorCoverage: [...new Set(sourceCourses.map((course) => course.theme))].sort().map((theme) => ({ theme, tier: getValidatorTier(theme) })),
  courses: courses.map(({ records, confusion, ...course }) => ({ ...course, confusion: Object.fromEntries([...confusion.entries()].sort(([a], [b]) => a.localeCompare(b))) })),
  worstCollections: worst.map(({ records, confusion, ...course }) => ({ ...course, confusion: Object.fromEntries(confusion) })),
  confusionMatrix: [...matrix.entries()].map(([key, count]) => { const [dataset, declaredTheme, detectedTheme] = key.split("|"); return { dataset, declaredTheme, detectedTheme, count } }).sort((a, b) => b.count - a.count || a.declaredTheme.localeCompare(b.declaredTheme)),
  examples,
  records: allRecords,
  recommendedRepairOrder: worst.map((course, index) => ({ rank: index + 1, dataset: course.dataset, theme: course.theme, stage: `m${course.stage}`, falsePositivePercent: course.falsePositivePercent, ambiguous: course.counts.AMBIGUOUS })),
  estimatedRetainedChunksAfterSemanticFiltering: learnerCourses.map((course) => ({ theme: course.theme, stage: `m${course.stage}`, currentLearnerRecords: course.total, estimatedSafeRecords: course.counts.VALID + course.counts["VALID BUT WEAK"], estimatedChunksAt20: Math.floor((course.counts.VALID + course.counts["VALID BUT WEAK"]) / 20), note: course.counts.AMBIGUOUS ? "Tier C / partial-validator cases require human review before exclusion." : "" })),
}

fs.mkdirSync(auditRoot, { recursive: true }); fs.mkdirSync(reviewRoot, { recursive: true })
fs.writeFileSync(path.join(auditRoot, "pattern-tactic-semantic-audit.json"), `${JSON.stringify(report, null, 2)}\n`)
const lines = [
  "# Pattern Tactics M1–M4 semantic correctness audit", "", "Read-only audit; source and learner records are replayed independently. Tier C results are **manual-review candidates**, not assertions of semantic failure.", "",
  `- Source: ${report.scope.sourceCourses} courses / ${report.scope.sourceRecords} records`, `- Learner: ${report.scope.learnerCourses} courses / ${report.scope.learnerRecords} records`, "",
  "## Validator coverage", "", "| Theme | Confidence tier |", "|---|---|", ...report.validatorCoverage.map(({ theme, tier }) => `| ${title(theme)} | ${tier} |`), "",
  "## Full course table", "", "| Dataset | Theme | Stage | Records | Valid | Weak | Ambiguous | Misclassified | Broken | False-positive % | Tier |", "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ...report.courses.map((course) => `| ${course.dataset} | ${title(course.theme)} | M${course.stage} | ${course.total} | ${course.counts.VALID} | ${course.counts["VALID BUT WEAK"]} | ${course.counts.AMBIGUOUS} | ${course.counts.MISCLASSIFIED} | ${course.counts["BROKEN / ILLEGAL"]} | ${course.falsePositivePercent}% | ${getValidatorTier(course.theme)} |`), "",
  "## 30 highest-priority collections", "", "| Rank | Dataset | Theme | Stage | False-positive % | Ambiguous |", "|---:|---|---|---:|---:|---:|",
  ...report.recommendedRepairOrder.map(({ rank, dataset, theme, stage, falsePositivePercent, ambiguous }) => `| ${rank} | ${dataset} | ${title(theme)} | ${stage.toUpperCase()} | ${falsePositivePercent}% | ${ambiguous} |`), "",
  "## Failure examples", "",
  ...["MISCLASSIFIED", "BROKEN / ILLEGAL", "VALID BUT WEAK", "AMBIGUOUS"].flatMap((status) => [`### ${status}`, "", ...report.examples[status].map((record) => `- **${record.puzzleId}** — [${record.route}](${record.route}); source ${record.sourceChunk}/${record.sourceIndex}; FEN \`${record.fen}\`; line \`${record.storedLine.join(" ")}\`; declared **${record.declaredTheme}**, detected **${record.detectedTheme}**. ${record.reason}`), ""]),
  "## Cross-theme confusion matrix", "", "| Dataset | Declared | Detected | Count |", "|---|---|---|---:|", ...report.confusionMatrix.map((item) => `| ${item.dataset} | ${item.declaredTheme} | ${item.detectedTheme} | ${item.count} |`), "",
  "## Repair guidance", "", "1. Repair all BROKEN / ILLEGAL source records first.", "2. Manually review Tier A MISCLASSIFIED records next; these have strong structural counter-evidence.", "3. Review VALID BUT WEAK and Tier B rows with line/material context before retaining them.", "4. Treat Tier C AMBIGUOUS records as a curation queue, never as automatic deletions.", "5. Rebuild learner overlays only from reviewed semantic decisions, preserving canonical identities and progress mappings.", "",
  `Machine-readable per-record details: [audit-reports/pattern-tactic-semantic-audit.json](../../audit-reports/pattern-tactic-semantic-audit.json).`,
]
fs.writeFileSync(path.join(reviewRoot, "pattern-tactic-semantic-audit.md"), `${lines.join("\n")}\n`)
console.log(JSON.stringify({ sourceCourses: report.scope.sourceCourses, learnerCourses: report.scope.learnerCourses, sourceRecords: report.scope.sourceRecords, learnerRecords: report.scope.learnerRecords, worst: report.recommendedRepairOrder.slice(0, 5) }, null, 2))
