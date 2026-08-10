import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { Chess } from "chess.js"

const root = process.cwd()
const learnerRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const coverage = JSON.parse(fs.readFileSync(path.join(root, "docs", "reviews", "pattern-tactic-semantic-v4-coverage.json"), "utf8"))
const unavailableReason = "Not enough reviewed material is available for this course yet."
const list = (value) => Array.isArray(value) ? value : Array.isArray(value?.puzzles) ? value.puzzles : []

assert.equal(coverage.coverage.length, 198, "the v4 matrix covers every M1–M4 focused tactic course")
for (const row of coverage.coverage) {
  const directory = path.join(learnerRoot, `${row.canonicalThemeKey}-m${row.stage}-${row.validationVersion}`)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"))
  assert.equal(Boolean(manifest.unavailable), row.unavailable, `${row.canonicalThemeKey} M${row.stage} has explicit availability`)
  if (row.unavailable) {
    assert.equal(manifest.unavailableReason, unavailableReason, `${row.canonicalThemeKey} M${row.stage} is fail-closed`)
    assert.equal(manifest.totalPuzzles, 0, `${row.canonicalThemeKey} M${row.stage} cannot serve raw fallback puzzles`)
    continue
  }
  assert.ok(/^semantic-v[23]$/.test(row.validationVersion), `${row.canonicalThemeKey} M${row.stage} has an approved semantic version`)
  assert.ok(manifest.totalPuzzles >= 20, `${row.canonicalThemeKey} M${row.stage} meets the reviewed-material floor`)
  assert.ok(manifest.totalChunks <= (row.stage === 1 ? 5 : 8), `${row.canonicalThemeKey} M${row.stage} respects learner caps`)
  assert.equal(manifest.totalPuzzles, manifest.files.reduce((total, file) => total + list(JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"))).length, 0), `${row.canonicalThemeKey} M${row.stage} manifest total matches chunks`)
  for (const file of manifest.files) for (const puzzle of list(JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")))) {
    new Chess(puzzle.fen)
    assert.ok(Array.isArray(puzzle.solutionLine) && puzzle.solutionLine.length > 0, `${row.canonicalThemeKey} M${row.stage} keeps strict stored solutions`)
  }
}

for (const mixed of coverage.mixed) {
  const directory = path.join(learnerRoot, `mixed-m${mixed.stage}-semantic-v5`)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"))
  const puzzles = list(JSON.parse(fs.readFileSync(path.join(directory, "chunk-001.json"), "utf8")))
  for (const theme of mixed.sourceThemes) assert.ok(manifest.sourceThemes.includes(theme), `mixed M${mixed.stage} retains approved ${theme} contributors`)
  assert.equal(manifest.contributionCounts["hanging-piece"] ?? 0, mixed.stage === 4 ? 23 : 0, `mixed M${mixed.stage} includes Batch 1 only where approved`)
  assert.equal(puzzles.some((puzzle) => /-v1\b/.test(String(puzzle.learnerCurriculum?.version ?? ""))), false, `mixed M${mixed.stage} contains no v1 contributors`)
  assert.equal(puzzles.some((puzzle) => ["endgame", "master", "mate", "hangingpiece", "discoveredcheck"].includes(String(puzzle.canonicalThemeKey).toLowerCase())), false, `mixed M${mixed.stage} excludes raw-tag labels`)
}

const trainerSource = fs.readFileSync(path.join(root, "src", "trainers", "patternTactic", "PatternTacticTrainer.tsx"), "utf8")
assert.match(trainerSource, /VERIFIED_FINAL_RUNTIME_PATH.*mixed-m\$\{tacticDistance\}/s, "trainer loads the generated final verified mixed overlay")
assert.match(trainerSource, /canonicalThemeKey \?\? puzzle\.sourceTheme/, "mixed rotation uses canonical tactic themes")
assert.match(trainerSource, /pedagogicalFamily: puzzle\.pedagogicalFamily/, "mixed selector receives family recency metadata")
assert.doesNotMatch(trainerSource, /isCheckmate\(\).*alternative/i, "tactic acceptance remains strict to stored solution lines")

console.log("PASS: every Pattern Tactic M1–M4 focused route is verified or explicitly unavailable; mixed pools use no raw v1 content")
