import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Chess } from "chess.js"

const root = process.cwd()
const learnerRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const coverage = JSON.parse(fs.readFileSync(path.join(root, "docs", "reviews", "pattern-tactic-semantic-v4-coverage.json"), "utf8"))
const unavailableReason = "Not enough reviewed material is available for this course yet."
const list = (value) => Array.isArray(value) ? value : Array.isArray(value?.puzzles) ? value.puzzles : []
const identity = (puzzle) => String(puzzle?.puzzleId ?? puzzle?.lichessId ?? puzzle?.lichess_id ?? puzzle?.PuzzleId ?? puzzle?.localId ?? puzzle?.id ?? "")
const membershipHash = (ids) => createHash("sha256").update(ids.join("\n")).digest("hex")

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

const inventory = JSON.parse(fs.readFileSync(path.join(root, "reports", "chunks", "full-chunk-inventory.json"), "utf8"))
assert.equal(inventory.deterministicTacticExclusions, 2084, "the restored taxonomy preserves all documented course-scoped tactic exclusions")
for (const stage of [1, 2, 3, 4]) {
  const directory = path.join(root, "public", "data", "full-curricula-v1", "pattern-tactics", "mixed", `m${stage}`)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"))
  const expectedFiles = Array.from({ length: 20 }, (_, index) => `chunk-${String(index + 1).padStart(3, "0")}.json`)
  const inventoryCourse = inventory.courses.find((course) => course.family === "tactics" && course.theme === "mixed" && course.distance === stage)
  assert.ok(inventoryCourse, `mixed M${stage} has an authoritative restoration inventory row`)
  assert.equal(manifest.curriculumVersion, "full-precut-v1", `mixed M${stage} uses the restored pre-cut curriculum`)
  assert.deepEqual(manifest.files, expectedFiles, `mixed M${stage} preserves all 20 ordered historical chunks`)
  assert.equal(manifest.totalChunks, 20, `mixed M${stage} has no five-chunk cap`)
  assert.equal(manifest.totalPuzzles, 600, `mixed M${stage} preserves all 600 historical memberships`)
  const chunkIds = manifest.files.map((file) => list(JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"))).map(identity))
  assert.ok(chunkIds.every((ids) => ids.length === 30), `mixed M${stage} keeps deterministic 30-puzzle chunk boundaries`)
  const allIds = chunkIds.flat()
  assert.equal(new Set(allIds).size, 600, `mixed M${stage} contains 600 unique memberships`)
  assert.equal(membershipHash(allIds), inventoryCourse.membershipHash, `mixed M${stage} membership and order match the authoritative pre-cut hash`)
  assert.deepEqual(
    chunkIds.map((ids, index) => ({ file: manifest.files[index], puzzleCount: ids.length, membershipHash: membershipHash(ids) })),
    inventoryCourse.chunkMembershipHashes,
    `mixed M${stage} preserves every historical chunk boundary and ordered membership hash`,
  )
  assert.equal(inventoryCourse.missingIds.length, 0, `mixed M${stage} has no unexplained missing memberships`)
  assert.equal(inventoryCourse.extraIds.length, 0, `mixed M${stage} has no unexplained extra memberships`)
}

const trainerSource = fs.readFileSync(path.join(root, "src", "trainers", "patternTactic", "PatternTacticTrainer.tsx"), "utf8")
assert.match(trainerSource, /FULL_MIXED_TACTIC_COURSES\.find\(\(course\) => course\.distance === tacticDistance\)/, "trainer resolves the restored Mixed course by distance")
assert.match(trainerSource, /mixedFullCourse\?\.dataBasePath/, "trainer loads the restored Mixed manifest instead of the generated-final overlay")
assert.match(trainerSource, /const sourceFiles = \[fileName\]/, "trainer lazy-loads only the selected restored Mixed chunk")
assert.doesNotMatch(trainerSource, /VERIFIED_FINAL_RUNTIME_PATH.*mixed-m\$\{tacticDistance\}/s, "generated-final Mixed overlay no longer overrides the restored curriculum")
assert.match(trainerSource, /canonicalThemeKey \?\? puzzle\.sourceTheme/, "mixed rotation uses canonical tactic themes")
assert.match(trainerSource, /pedagogicalFamily: puzzle\.pedagogicalFamily/, "mixed selector receives family recency metadata")
assert.doesNotMatch(trainerSource, /isCheckmate\(\).*alternative/i, "tactic acceptance remains strict to stored solution lines")

console.log("PASS: every Pattern Tactic M1–M4 focused route is verified or explicitly unavailable; mixed pools use no raw v1 content")
