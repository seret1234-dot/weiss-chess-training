import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dataRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const output = path.join(root, "docs", "reviews", "pattern-tactic-tier-a-semantic-v2-review.md")
const counts = JSON.parse(fs.readFileSync(path.join(root, "docs", "reviews", "pattern-tactic-tier-a-semantic-v2-counts.json"), "utf8"))
const esc = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ")
const lines = ["# Pattern Tactics Tier A semantic-v2 review", "", "Only records classified **VALID** by the committed semantic validator appear here. Original sources and v1 overlays are unchanged.", "", "| Theme | Stage | Source valid | Retained | Chunks | Unavailable | Rejected: weak / ambiguous / misclassified / broken |", "|---|---:|---:|---:|---:|---|---|"]
for (const entry of counts.sort((a, b) => a.theme.localeCompare(b.theme) || a.stage - b.stage)) lines.push(`| ${entry.theme} | M${entry.stage} | ${entry.valid} | ${entry.retained} | ${entry.chunks} | ${entry.unavailable ? "Yes" : "No"} | ${entry.rejected["VALID BUT WEAK"] ?? 0} / ${entry.rejected.AMBIGUOUS ?? 0} / ${entry.rejected.MISCLASSIFIED ?? 0} / ${entry.rejected["BROKEN / ILLEGAL"] ?? 0} |`)
for (const entry of counts.filter((item) => !item.unavailable).sort((a, b) => a.theme.localeCompare(b.theme) || a.stage - b.stage)) {
  const directory = path.join(dataRoot, `${entry.theme}-m${entry.stage}-semantic-v2`)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"))
  lines.push("", `## ${manifest.canonicalThemeLabel} — M${entry.stage}`, "", "| Learner chunk | Source chunk/index | Puzzle | Semantic evidence |", "|---:|---|---|---|")
  for (const file of manifest.files) for (const puzzle of JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")).puzzles ?? []) {
    const learner = puzzle.learnerCurriculum ?? {}
    lines.push(`| ${learner.learnerChunk} | ${learner.sourceChunk}/${learner.sourceIndex} | ${esc(puzzle.id)} | ${esc(puzzle.semanticAudit?.reason)} ${esc(JSON.stringify(puzzle.semanticAudit?.evidence ?? {}))} |`)
  }
}
fs.writeFileSync(output, `${lines.join("\n")}\n`)
console.log(output)
