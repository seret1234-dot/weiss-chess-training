import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const root = process.cwd()
const output = resolve(root, "docs/reviews/pattern-mate-m2-m5-curriculum-review.md")
const labels = { "back-rank": "Back Rank", anastasia: "Anastasia", arabian: "Arabian", boden: "Boden", smothered: "Smothered", hook: "Hook", "kill-box": "Kill Box", dovetail: "Dovetail", "double-bishop": "Double Bishop" }
const stageThemes = {
  2: ["anastasia", "back-rank", "arabian", "boden", "smothered", "hook", "kill-box", "dovetail", "double-bishop"],
  3: ["anastasia", "back-rank", "arabian", "boden", "smothered", "hook", "kill-box", "dovetail", "double-bishop"],
  4: ["anastasia", "back-rank", "arabian", "smothered", "hook", "kill-box", "dovetail"],
  5: ["anastasia", "back-rank", "arabian", "hook", "kill-box", "dovetail"],
}
const cell = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ")
const line = (puzzle) => Array.isArray(puzzle.solutionLine) ? puzzle.solutionLine : Array.isArray(puzzle.moves) ? puzzle.moves : Array.isArray(puzzle.solution) ? puzzle.solution : typeof puzzle.solution === "string" ? [puzzle.solution] : []
const lines = [
  "# Pattern Mate M2–M5 learner-curriculum review",
  "",
  "Generated from committed learner overlays. Original source pools and legacy progress remain unchanged.",
  "",
  "Canonical identity is the displayed post-preMove FEN + mate objective + complete stored line + source identity. Pedagogical families are symmetry-normalized structural signatures used only for curation and mixed-session recency.",
  "",
]

for (const distance of [2, 3, 4, 5]) {
  lines.push(`## Mate in ${distance}`, "")
  for (const theme of stageThemes[distance]) {
    const base = resolve(root, `public/data/learner-curricula/pattern-mates/${theme}-m${distance}-v1`)
    const manifest = JSON.parse(await readFile(resolve(base, "manifest.json"), "utf8"))
    const stats = manifest.sourceStatistics ?? {}
    lines.push(`### ${labels[theme]} M${distance}`, "")
    lines.push(`- Source chunks: **${stats.sourceChunks}**; source records: **${stats.sourcePositions}**; legal complete lines: **${stats.legalRecords}**.`)
    lines.push(`- Exact unique positions: **${stats.exactFenUnique}**; pedagogical families: **${stats.pedagogicalFamilyCount}**; retained: **${manifest.totalPuzzles}** across **${manifest.totalChunks}** learner chunks.`)
    lines.push(`- Legacy mapping: ${manifest.legacyMapping}`)
    if (manifest.exception) lines.push(`- Exception: ${manifest.exception}`)
    lines.push(`- Largest source families: ${(stats.largestPedagogicalFamilies ?? []).slice(0, 3).map((entry) => `${entry.sourcePositions}×`).join(", ") || "n/a"}.`, "")
    for (const file of manifest.files) {
      const payload = JSON.parse(await readFile(resolve(base, file), "utf8"))
      const puzzles = payload.puzzles ?? payload
      const regionCounts = new Map()
      for (const puzzle of puzzles) for (const tag of puzzle.learnerCurriculum?.diversityTags ?? []) if (tag.startsWith("king-region:")) regionCounts.set(tag, (regionCounts.get(tag) ?? 0) + 1)
      lines.push(`#### Learner chunk ${Number(file.match(/\d+/)?.[0] ?? 0)}`, "")
      lines.push(`- Exercises: ${puzzles.length}; king regions: ${[...regionCounts.entries()].map(([tag, count]) => `${tag.slice("king-region:".length)}: ${count}`).join("; ") || "n/a"}.`, "")
      lines.push("| # | Canonical theme | Source chunk / index | Starting FEN | preMove | Stored solution line | Canonical identity | Pedagogical family | Symmetry | Structural/diversity tags | Retention reason |", "|---:|---|---|---|---|---|---|---|---|---|---|")
      puzzles.forEach((puzzle, index) => {
        const learner = puzzle.learnerCurriculum ?? {}
        const source = `${Number(learner.sourceChunkIndex ?? 0) + 1} / ${Number(learner.sourcePuzzleIndex ?? 0) + 1}`
        lines.push(`| ${index + 1} | ${cell(puzzle.canonicalThemeLabel ?? labels[theme])} | ${cell(source)} | \`${cell(puzzle.fen)}\` | \`${cell(puzzle.preMove ?? "") }\` | \`${cell(line(puzzle).join(" "))}\` | \`${cell(learner.canonicalIdentity)}\` | \`${cell(learner.pedagogicalFamily ?? puzzle.pedagogicalFamily)}\` | ${cell(learner.symmetry)} | ${cell((learner.diversityTags ?? []).join("; "))} | ${cell(learner.retainedReason)} |`)
      })
      lines.push("")
    }
  }
}
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${lines.join("\n").trimEnd()}\n`, "utf8")
console.log(`Generated ${output}`)
