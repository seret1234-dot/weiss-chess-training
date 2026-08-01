import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { canonicalIdentity, puzzleArray, storedLine, validateTacticRecord } from "./lib/pattern-tactic-semantic-validator.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceRoot = path.join(root, "public", "data", "pattern-tactics")
const learnerRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const chunkSize = 20
const approvedChunks = {
  "bishop-fork-m1": 5, "bishop-fork-m2": 8, "bishop-fork-m3": 5, "bishop-fork-m4": 3,
  "knight-fork-m1": 5, "knight-fork-m2": 8, "knight-fork-m3": 8, "knight-fork-m4": 6,
  "rook-fork-m1": 5, "rook-fork-m2": 8, "rook-fork-m3": 2, "rook-fork-m4": 3,
  "queen-fork-m1": 5, "queen-fork-m2": 8, "queen-fork-m3": 8, "queen-fork-m4": 7,
  "pawn-fork-m1": 5, "pawn-fork-m2": 8, "pawn-fork-m3": 6, "pawn-fork-m4": 4,
  "king-fork-m1": 4, "king-fork-m3": 0, "king-fork-m4": 0,
  "bishop-pin-m1": 5, "bishop-pin-m2": 8, "bishop-pin-m3": 7, "bishop-pin-m4": 4,
  "queen-pin-m1": 5, "queen-pin-m2": 6, "queen-pin-m3": 5, "queen-pin-m4": 4,
  "rook-pin-m1": 5, "rook-pin-m2": 8, "rook-pin-m3": 4, "rook-pin-m4": 4,
  "bishop-skewer-m1": 5, "bishop-skewer-m2": 8, "bishop-skewer-m3": 6, "bishop-skewer-m4": 3,
  "queen-skewer-m1": 5, "queen-skewer-m2": 8, "queen-skewer-m3": 6, "queen-skewer-m4": 4,
  "rook-skewer-m1": 5, "rook-skewer-m2": 8, "rook-skewer-m3": 5, "rook-skewer-m4": 5,
  "discovered-attack-m1": 5, "discovered-attack-m2": 8, "discovered-attack-m3": 6, "discovered-attack-m4": 4,
  "discovered-check-m1": 5, "discovered-check-m2": 8, "discovered-check-m3": 4, "discovered-check-m4": 3,
  "double-check-m1": 5, "double-check-m2": 8, "double-check-m3": 5, "double-check-m4": 4,
  "promotion-m1": 2, "promotion-m2": 8, "promotion-m3": 8, "promotion-m4": 8,
  "underpromotion-m1": 4, "underpromotion-m2": 8, "underpromotion-m3": 8, "underpromotion-m4": 8,
  "knight-underpromotion-m1": 5, "knight-underpromotion-m2": 8, "knight-underpromotion-m3": 8, "knight-underpromotion-m4": 8,
  "en-passant-m1": 5, "en-passant-m2": 8, "en-passant-m3": 8, "en-passant-m4": 8,
}

function hash(value) { let h = 2166136261; for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
function label(theme) { return theme === "en-passant" ? "En passant" : theme.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ") }
function sourceId(raw, fallback) { return String(raw.puzzleId ?? raw.lichessId ?? raw.lichess_id ?? raw.PuzzleId ?? raw.id ?? fallback) }
function rawTags(raw) { return [...new Set([raw.themes, raw.theme, raw.subtheme, raw.label].flatMap((value) => Array.isArray(value) ? value : [value]).map(String).filter(Boolean))] }
function pedagogicalFamily(raw, theme, validation) { return `${theme}|${validation.displayedFen}|${validation.activeLine[0] ?? ""}` }
function output(raw, theme, stage, sourceChunk, sourceIndex, validation, learnerChunk, order) {
  const sourceIdentity = sourceId(raw, `${theme}-m${stage}-${sourceChunk}-${sourceIndex}`)
  return {
    ...raw,
    canonicalThemeKey: theme,
    canonicalThemeLabel: label(theme),
    rawTags: rawTags(raw),
    pedagogicalFamily: pedagogicalFamily(raw, theme, validation),
    semanticAudit: { version: "tier-a-semantic-v2", status: validation.status, tier: validation.tier, confidence: validation.confidence, reason: validation.reason, detectedTheme: validation.detectedTheme, evidence: validation.evidence },
    learnerCurriculum: {
      version: `m${stage}-semantic-v2`, tacticDistance: stage, learnerChunk: learnerChunk + 1, orderInChunk: order,
      sourceChunk, sourceIndex, sourceIdentity, canonicalIdentity: canonicalIdentity(raw, theme), pedagogicalFamily: pedagogicalFamily(raw, theme, validation),
      retainedReason: "Strict semantic-v2: complete line replayed and classified VALID by the committed Tier A validator.",
    },
  }
}

function read(file) { return JSON.parse(fs.readFileSync(file, "utf8")) }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`) }
const report = []

for (const [course, requestedChunks] of Object.entries(approvedChunks)) {
  const [theme, stageLabel] = course.match(/^(.*)-m([1-4])$/).slice(1)
  const stage = Number(stageLabel)
  const sourceDir = path.join(sourceRoot, theme, `m${stage}`)
  const manifest = read(path.join(sourceDir, "manifest.json"))
  const candidates = []
  const rejected = { "VALID BUT WEAK": 0, AMBIGUOUS: 0, MISCLASSIFIED: 0, "BROKEN / ILLEGAL": 0 }
  manifest.files.forEach((file, chunkIndex) => puzzleArray(read(path.join(sourceDir, file))).forEach((raw, sourceIndex) => {
    const validation = validateTacticRecord(raw, theme)
    if (validation.status === "VALID") candidates.push({ raw, validation, sourceChunk: chunkIndex + 1, sourceIndex })
    else rejected[validation.status] = (rejected[validation.status] ?? 0) + 1
  }))
  const target = requestedChunks * chunkSize
  if (candidates.length < target) throw new Error(`${course}: expected ${target} strict-valid records, found ${candidates.length}`)
  const selected = [...candidates].sort((a, b) => hash(`${course}|${sourceId(a.raw, a.sourceIndex)}`) - hash(`${course}|${sourceId(b.raw, b.sourceIndex)}`) || sourceId(a.raw, a.sourceIndex).localeCompare(sourceId(b.raw, b.sourceIndex))).slice(0, target)
  const outputDir = path.join(learnerRoot, `${theme}-m${stage}-semantic-v2`)
  fs.rmSync(outputDir, { recursive: true, force: true })
  if (requestedChunks === 0) {
    write(path.join(outputDir, "manifest.json"), { schemaVersion: 1, curriculumVersion: `pattern-tactic-m${stage}-semantic-v2`, category: "tactics", theme, tacticDistance: stage, unavailable: true, unavailableReason: "Not enough semantically verified material is available for this course yet.", totalPuzzles: 0, totalChunks: 0, files: [], sourceManifest: `/data/pattern-tactics/${theme}/m${stage}/manifest.json`, semanticCounts: { sourceRecords: candidates.length + Object.values(rejected).reduce((a, b) => a + b, 0), valid: candidates.length, rejected } })
    report.push({ theme, stage, valid: candidates.length, chunks: 0, retained: 0, unavailable: true, rejected }); continue
  }
  const files = []
  for (let chunk = 0; chunk < requestedChunks; chunk += 1) {
    const file = `chunk-${String(chunk + 1).padStart(3, "0")}.json`
    files.push(file)
    write(path.join(outputDir, file), { puzzles: selected.slice(chunk * chunkSize, (chunk + 1) * chunkSize).map((candidate, order) => output(candidate.raw, theme, stage, candidate.sourceChunk, candidate.sourceIndex, candidate.validation, chunk, order)) })
  }
  write(path.join(outputDir, "manifest.json"), { schemaVersion: 1, curriculumVersion: `pattern-tactic-m${stage}-semantic-v2`, category: "tactics", theme, canonicalThemeKey: theme, canonicalThemeLabel: label(theme), tacticDistance: stage, objective: `tactic-in-${stage}`, totalPuzzles: selected.length, chunkSize, totalChunks: requestedChunks, files, sourceManifest: `/data/pattern-tactics/${theme}/m${stage}/manifest.json`, semanticFilter: "strict VALID only; weak, ambiguous, misclassified, and broken records excluded", legacyMapping: "Legacy progress maps proportionally to active semantic-v2 chunks; original rows remain immutable.", semanticCounts: { sourceRecords: candidates.length + Object.values(rejected).reduce((a, b) => a + b, 0), valid: candidates.length, retained: selected.length, rejected } })
  report.push({ theme, stage, valid: candidates.length, chunks: requestedChunks, retained: selected.length, unavailable: false, rejected })
}

// Mixed sessions keep Tier B/C v1 pools untouched but replace each Tier A
// contributor with its semantic-v2 overlay.
for (const stage of [1, 2, 3, 4]) {
  const pools = fs.readdirSync(sourceRoot).filter((theme) => theme !== "mixed" && fs.existsSync(path.join(sourceRoot, theme, `m${stage}`, "manifest.json"))).sort()
  const puzzles = []
  const sourceThemes = []
  for (const theme of pools) {
    const semanticDir = path.join(learnerRoot, `${theme}-m${stage}-semantic-v2`)
    const v1Dir = path.join(learnerRoot, `${theme}-m${stage}-v1`)
    const directory = fs.existsSync(path.join(semanticDir, "manifest.json")) ? semanticDir : v1Dir
    const manifest = read(path.join(directory, "manifest.json"))
    if (manifest.unavailable) continue
    sourceThemes.push(theme)
    for (const file of manifest.files) puzzles.push(...puzzleArray(read(path.join(directory, file))))
  }
  const mixedDir = path.join(learnerRoot, `mixed-m${stage}-semantic-v2`)
  write(path.join(mixedDir, "chunk-001.json"), { puzzles })
  write(path.join(mixedDir, "manifest.json"), { schemaVersion: 1, curriculumVersion: `pattern-tactic-mixed-m${stage}-semantic-v2`, category: "tactics", theme: "mixed", tacticDistance: stage, totalPuzzles: puzzles.length, totalChunks: 1, chunkSize: puzzles.length, files: ["chunk-001.json"], sourceThemes, note: "Tier A contributors use strict semantic-v2 overlays; Tier B/C contributors remain unchanged v1 pools." })
}
write(path.join(root, "docs", "reviews", "pattern-tactic-tier-a-semantic-v2-counts.json"), report)
console.log(JSON.stringify(report, null, 2))
