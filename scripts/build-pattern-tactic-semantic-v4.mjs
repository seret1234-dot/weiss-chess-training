import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceRoot = path.join(root, "public", "data", "pattern-tactics")
const learnerRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const reviewRoot = path.join(root, "docs", "reviews")
const unavailableReason = "Not enough reviewed material is available for this course yet."
const minimumActiveExercises = 20

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}
const list = (value) => Array.isArray(value) ? value : value?.puzzles ?? []
const label = (theme) => ({
  "attacking-f2-f7": "Attacking f2/f7",
  "en-passant": "En passant",
}[theme] ?? theme.split("-").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" "))

function validatorPlanFor(theme) {
  if (/(?:fork)$/.test(theme)) return "fork-sound-v3"
  if (/(?:pin|skewer)$/.test(theme) || ["discovered-attack", "discovered-check", "double-check", "promotion", "underpromotion", "knight-underpromotion", "en-passant"].includes(theme)) return "tier-a-semantic-v2"
  const rules = {
    "bishop-xray": "xray-line-duty", "queen-xray": "xray-line-duty", "rook-xray": "xray-line-duty", "other-xray": "xray-line-duty",
    "hanging-piece": "hanging-piece-best-defense", "trapped-piece": "trapped-piece-escape-search", "remove-the-defender": "defender-duty-and-best-defense",
    "attacking-f2-f7": "f2-f7-specific-weakness", clearance: "clearance-line-or-square", "clearance-sacrifice": "clearance-plus-sacrifice-compensation",
    deflection: "deflection-defensive-duty", "decoy-attraction": "forced-attraction-square", "decoy-deflection": "forced-deflection-duty",
    interference: "interference-defensive-line", "interference-sacrifice": "interference-plus-sacrifice-compensation",
    zwischenzug: "intermediate-forcing-move", zugzwang: "all-legal-replies-worsen", defense: "concrete-threat-prevention",
    "advanced-pawn": "advanced-pawn-concrete-threat", "quiet-move": "quiet-move-decisive-threat", "vulnerable-king": "precise-king-attack-objective",
    "kingside-attack": "precise-kingside-objective", "queenside-attack": "precise-queenside-objective",
    "bishop-sacrifice": "sacrifice-compensation", "knight-sacrifice": "sacrifice-compensation", "pawn-sacrifice": "sacrifice-compensation", "queen-sacrifice": "sacrifice-compensation", "rook-sacrifice": "exchange-sacrifice-compensation", "king-sacrifice": "sacrifice-compensation",
  }
  return rules[theme] ?? "dedicated-theme-validator-required"
}

function sourceCourses() {
  const courses = []
  for (const theme of fs.readdirSync(sourceRoot).sort()) {
    if (theme === "mixed") continue
    for (const distance of [1, 2, 3, 4]) {
      const manifestPath = path.join(sourceRoot, theme, `m${distance}`, "manifest.json")
      if (!fs.existsSync(manifestPath)) continue
      const manifest = read(manifestPath)
      const sourceRecords = manifest.files.reduce((total, file) => total + list(read(path.join(path.dirname(manifestPath), file))).length, 0)
      courses.push({ theme, distance, sourceRecords, sourceManifest: manifestPath })
    }
  }
  return courses
}

function approvedManifest(theme, distance) {
  // Fork soundness is stricter than the original geometry-only semantic-v2
  // pass. A v2 fork must never be resurrected when the best-defense v3
  // evidence is source-limited or unavailable.
  const versions = /-fork$/.test(theme) ? ["semantic-v3"] : ["semantic-v2"]
  for (const version of versions) {
    const directory = path.join(learnerRoot, `${theme}-m${distance}-${version}`)
    const manifestPath = path.join(directory, "manifest.json")
    if (!fs.existsSync(manifestPath)) continue
    const manifest = read(manifestPath)
    if (manifest.unavailable || !Array.isArray(manifest.files)) continue
    if (Number(manifest.totalPuzzles ?? 0) < minimumActiveExercises) continue
    return { version, directory, manifest }
  }
  return null
}

function writeUnavailableOverlay(course, prior) {
  const directory = path.join(learnerRoot, `${course.theme}-m${course.distance}-semantic-v4`)
  write(path.join(directory, "manifest.json"), {
    schemaVersion: 1,
    curriculumVersion: `pattern-tactic-${course.theme}-m${course.distance}-semantic-v4`,
    category: "tactics",
    theme: course.theme,
    canonicalThemeKey: course.theme,
    canonicalThemeLabel: label(course.theme),
    tacticDistance: course.distance,
    unavailable: true,
    unavailableReason,
    totalPuzzles: 0,
    totalChunks: 0,
    files: [],
    sourceManifest: `/data/pattern-tactics/${course.theme}/m${course.distance}/manifest.json`,
    semanticFilter: "Fail closed: raw v1 material is unavailable until its dedicated semantic validator proves each retained record.",
    semanticCounts: { valid: 0, validButSourceLimited: 0, ambiguous: 0, misclassified: 0, broken: 0, unreviewed: course.sourceRecords },
    validation: { version: "semantic-v4", validator: validatorPlanFor(course.theme), confidence: "unvalidated", priorLearnerVersion: prior?.version ?? "v1" },
    legacyMapping: "Legacy rows remain immutable. This unavailable course grants no new curriculum progression until reviewed material exists.",
  })
}

function semanticCountsFor(manifest, active, sourceRecords) {
  if (!active) return { valid: 0, validButSourceLimited: 0, ambiguous: 0, misclassified: 0, broken: 0, unreviewed: sourceRecords }
  if (manifest.semanticCounts) {
    const rejected = manifest.semanticCounts.rejected ?? {}
    return {
      valid: Number(manifest.semanticCounts.valid ?? manifest.totalPuzzles ?? 0),
      validButSourceLimited: 0,
      ambiguous: Number(rejected.AMBIGUOUS ?? 0),
      misclassified: Number(rejected.MISCLASSIFIED ?? 0),
      broken: Number(rejected["BROKEN / ILLEGAL"] ?? 0),
      unreviewed: 0,
    }
  }
  const counts = manifest.soundness?.classificationCounts ?? {}
  return Object.entries(counts).reduce((result, [classification, count]) => {
    const amount = Number(count)
    if (classification.startsWith("SOUND_")) result.valid += amount
    else if (classification.startsWith("UNSOUND_") || classification === "NOT_GEOMETRIC_FORK") result.misclassified += amount
    else result.ambiguous += amount
    return result
  }, { valid: 0, validButSourceLimited: 0, ambiguous: 0, misclassified: 0, broken: 0, unreviewed: 0 })
}

const coverage = []
const approvedByCourse = new Map()
for (const course of sourceCourses()) {
  const approved = approvedManifest(course.theme, course.distance)
  const currentV1Path = path.join(learnerRoot, `${course.theme}-m${course.distance}-v1`, "manifest.json")
  const prior = fs.existsSync(currentV1Path) ? read(currentV1Path) : null
  const active = Boolean(approved)
  if (!active) writeUnavailableOverlay(course, prior)
  const manifest = approved?.manifest ?? read(path.join(learnerRoot, `${course.theme}-m${course.distance}-semantic-v4`, "manifest.json"))
  const retained = Number(manifest.totalPuzzles ?? 0)
  const chunks = Number(manifest.totalChunks ?? 0)
  const semanticCounts = semanticCountsFor(manifest, active, course.sourceRecords)
  const status = !active ? "UNAVAILABLE" : retained < course.sourceRecords ? "REVIEWED BUT SOURCE-LIMITED" : "VERIFIED AND ACTIVE"
  const row = {
    canonicalThemeKey: course.theme,
    displayLabel: label(course.theme),
    stage: course.distance,
    sourceRecords: course.sourceRecords,
    currentLearnerRecords: Number(prior?.totalPuzzles ?? 0),
    validationVersion: approved?.version ?? "semantic-v4",
    focusedTraining: active,
    mixedTraining: active,
    proposedValidator: active ? (approved?.version === "semantic-v3" ? "fork-sound-v3" : "tier-a-semantic-v2") : validatorPlanFor(course.theme),
    confidence: active ? (approved?.version === "semantic-v3" ? "high: fixed-depth best-defense plus geometry" : "high: strict legal-line structural proof") : "none: fail closed pending dedicated proof",
    intendedStatus: status,
    retained,
    chunks,
    unavailable: !active,
    semanticCounts,
  }
  coverage.push(row)
  if (active) approvedByCourse.set(`${course.theme}-m${course.distance}`, approved)
}

const mixed = []
for (const distance of [1, 2, 3, 4]) {
  const puzzles = []
  const sourceThemes = []
  const contributionCounts = {}
  for (const row of coverage.filter((entry) => entry.stage === distance && entry.focusedTraining).sort((a, b) => a.canonicalThemeKey.localeCompare(b.canonicalThemeKey))) {
    const approved = approvedByCourse.get(`${row.canonicalThemeKey}-m${distance}`)
    let contribution = 0
    for (const file of approved.manifest.files) {
      const entries = list(read(path.join(approved.directory, file))).map((puzzle) => ({
        ...puzzle,
        canonicalThemeKey: row.canonicalThemeKey,
        canonicalThemeLabel: row.displayLabel,
      }))
      puzzles.push(...entries)
      contribution += entries.length
    }
    sourceThemes.push(row.canonicalThemeKey)
    contributionCounts[row.canonicalThemeKey] = contribution
  }
  const directory = path.join(learnerRoot, `mixed-m${distance}-semantic-v4`)
  write(path.join(directory, "chunk-001.json"), { puzzles })
  write(path.join(directory, "manifest.json"), {
    schemaVersion: 1,
    curriculumVersion: `pattern-tactic-mixed-m${distance}-semantic-v4`,
    category: "tactics",
    theme: "mixed",
    tacticDistance: distance,
    totalPuzzles: puzzles.length,
    totalChunks: 1,
    chunkSize: puzzles.length,
    files: ["chunk-001.json"],
    sourceThemes,
    contributionCounts,
    note: "Every contributor comes from its latest approved semantic overlay. Raw v1 and unavailable courses are excluded from both unlocked and all-theme practice.",
  })
  mixed.push({ stage: distance, sourceThemes, contributionCounts, totalPuzzles: puzzles.length })
}

write(path.join(reviewRoot, "pattern-tactic-semantic-v4-coverage.json"), { generatedBy: "npm run build:pattern-tactic-semantic-v4", coverage, mixed })
const lines = [
  "# Pattern Tactic semantic-v4 coverage matrix", "",
  "Generated with `npm run build:pattern-tactic-semantic-v4`. Raw v1 collections remain intact but are never active: any course without an existing strict semantic-v2 or fork-sound-v3 overlay is explicitly unavailable pending its named validator.", "",
  "| Theme | Stage | Source | Prior learner | Version | Focused | Mixed | Validator | Status | Valid | Ambiguous | Misclassified | Broken | Unreviewed | Retained | Chunks |", "|---|---:|---:|---:|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|",
  ...coverage.map((row) => `| ${row.displayLabel} | M${row.stage} | ${row.sourceRecords} | ${row.currentLearnerRecords} | ${row.validationVersion} | ${row.focusedTraining ? "yes" : "no"} | ${row.mixedTraining ? "yes" : "no"} | ${row.proposedValidator} | ${row.intendedStatus} | ${row.semanticCounts.valid} | ${row.semanticCounts.ambiguous} | ${row.semanticCounts.misclassified} | ${row.semanticCounts.broken} | ${row.semanticCounts.unreviewed} | ${row.retained} | ${row.chunks} |`),
  "", "## Mixed semantic-v4 contributions", "",
  ...mixed.map((row) => `- M${row.stage}: ${row.totalPuzzles} approved puzzles from ${row.sourceThemes.length} themes — ${Object.entries(row.contributionCounts).map(([theme, count]) => `${theme} ${count}`).join(", ")}.`),
  "", "## Safety result", "", "No raw v1 learner overlay is referenced by focused or mixed Pattern Tactic runtime data. The unavailable manifests are intentional placeholders, not fallback pools.",
]
fs.writeFileSync(path.join(reviewRoot, "pattern-tactic-semantic-v4-coverage.md"), `${lines.join("\n")}\n`)
console.log(JSON.stringify({ coverage, mixed }, null, 2))
