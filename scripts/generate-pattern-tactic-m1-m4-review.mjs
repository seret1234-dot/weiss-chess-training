import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dataRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const output = path.join(root, "docs", "reviews", "pattern-tactic-m1-m4-curriculum-review.md")
const cell = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ")
const lines = ["# Pattern Tactics M1–M4 learner curriculum review", "", "Generated deterministically from preserved source pools. Original manifests and chunks are not modified.", ""]

for (const directory of fs.readdirSync(dataRoot).filter((name) => !name.startsWith("mixed-")).sort()) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, directory, "manifest.json"), "utf8"))
  const stats = manifest.sourceStatistics
  lines.push(`## ${manifest.canonicalThemeLabel} — M${manifest.tacticDistance}`)
  lines.push("")
  lines.push(`- Source chunks/records: ${stats.sourceChunks} / ${stats.sourcePositions}`)
  lines.push(`- Legal records: ${stats.legalRecords}; exact displayed positions: ${stats.exactFenUnique}; exact identities: ${stats.exactExerciseUnique}; pedagogical families: ${stats.pedagogicalFamilyCount}`)
  lines.push(`- Retained: ${manifest.totalPuzzles} in ${manifest.totalChunks} learner chunks. Legacy mapping: ${manifest.legacyMapping}`)
  lines.push(`- Largest families: ${(stats.largestPedagogicalFamilies ?? []).slice(0, 3).map((entry) => `${entry.sourcePositions}× ${entry.family}`).join("; ") || "none"}`)
  if (manifest.exception) lines.push(`- Exception: ${manifest.exception}`)
  lines.push("")
  lines.push("| Learner chunk | Source chunk/index | Puzzle ID | FEN | preMove | Stored solution | Canonical identity | Family | Symmetry | Tags | Retained reason |")
  lines.push("|---:|---|---|---|---|---|---|---|---|---|---|")
  for (const file of manifest.files) {
    const puzzles = JSON.parse(fs.readFileSync(path.join(dataRoot, directory, file), "utf8")).puzzles ?? []
    for (const puzzle of puzzles) {
      const learner = puzzle.learnerCurriculum ?? {}
      lines.push(`| ${learner.learnerChunk ?? ""} | ${learner.sourceChunk ?? ""}/${learner.sourceIndex ?? ""} | ${cell(puzzle.id)} | ${cell(puzzle.fen)} | ${cell(puzzle.preMove)} | ${cell((puzzle.solutionLine ?? []).join(" "))} | ${cell(learner.canonicalIdentity)} | ${cell(learner.pedagogicalFamily)} | ${cell(learner.symmetry)} | ${cell((learner.diversityTags ?? []).join(", "))} | ${cell(learner.retainedReason)} |`)
    }
  }
  lines.push("")
}
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${lines.join("\n")}\n`)
console.log(output)
