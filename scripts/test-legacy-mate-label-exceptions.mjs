import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { detectAllMateThemes } from "./lib/detect-mate-themes.mjs"
import { replayPuzzleToTerminal } from "./lib/detect-smothered-mate.mjs"

const root = process.cwd()
const expected = new Map([
  ["TU3oY", ["boden", "public/data/pattern-mates/boden/mate-in-2/chunk_40.json"]],
  ["pWFY5", ["boden", "public/data/pattern-mates/boden/mate-in-2/chunk_42.json"]],
  ["oM0jM", ["dovetail", "public/data/pattern-mates/dovetail/mate-in-2/chunk-027.json"]],
  ["44UOa", ["dovetail", "public/data/pattern-mates/dovetail/mate-in-2/chunk-030.json"]],
  ["HWVxK", ["dovetail", "public/data/pattern-mates/dovetail/mate-in-3/chunk-007.json"]],
])
const register = JSON.parse(await readFile(resolve(root, "reports/master-mates/v1/legacy-mate-label-exceptions.json"), "utf8"))
assert.equal(register.exceptions.length, expected.size)
for (const entry of register.exceptions) {
  const [theme, source] = expected.get(entry.id) ?? []
  assert.equal(entry.disposition, "LEGACY_LABEL_EXCEPTION")
  assert.equal(entry.historicalTheme, theme)
  assert.equal(entry.packagedSource.file, source)
  assert.ok(entry.originalLichessPuzzle.apiThemes.includes(theme === "boden" ? "bodenMate" : "dovetailMate"))
  assert.equal(entry.detector.matched, false)
  assert.deepEqual(entry.detector.allMatchedThemes, [])
  assert.equal(entry.rootCause.classification, "E. LABEL_PROVENANCE_NOT_RETAINED")
  const payload = JSON.parse(await readFile(resolve(root, source), "utf8"))
  const record = (Array.isArray(payload) ? payload : payload.puzzles).find((candidate) => String(candidate.puzzleId ?? candidate.lichessId ?? candidate.id).replace(/^[a-z-]+-mate-in-\d+-/, "") === entry.id)
  assert.ok(record, `source record ${entry.id}`)
  const replay = replayPuzzleToTerminal(record)
  assert.equal(replay.game.isCheckmate(), true, `${entry.id} must remain a legal terminal mate`)
  assert.equal(detectAllMateThemes(record)[theme].matched, false, `${entry.id} must not widen ${theme}`)
}

const matrix = JSON.parse(await readFile(resolve(root, "reports/master-mates/v1/regular-mate-detector-matrix.json"), "utf8"))
assert.equal(matrix.totalRecords, 40002)
assert.deepEqual(matrix.cardinality, { exactlyOne: 39963, multi: 34, zero: 5 })
assert.deepEqual(Object.fromEntries(Object.entries(matrix.courses).map(([course, row]) => [course, [row.total, row.ownDetectorMatches, row.misses]])), {
  smothered: [4801, 4801, 0], "back-rank": [9886, 9886, 0], arabian: [3754, 3754, 0], anastasia: [5118, 5118, 0],
  boden: [2831, 2829, 2], hook: [4214, 4214, 0], dovetail: [2726, 2723, 3], "double-bishop": [2858, 2858, 0],
  "kill-box-adjacent-rook": [2553, 2553, 0], "kill-box-rook-rail": [750, 750, 0], "kill-box-queen-fence": [511, 511, 0],
})
assert.deepEqual(matrix.overlapCombinations, {
  anastasia: 5117, "anastasia + kill-box-adjacent-rook": 1, arabian: 3753, "arabian + kill-box-adjacent-rook": 1,
  "back-rank": 9854, "back-rank + kill-box-rook-rail": 32, boden: 2829, ZERO: 5, "double-bishop": 2858,
  dovetail: 2723, hook: 4214, "kill-box-adjacent-rook": 2553, "kill-box-queen-fence": 511, "kill-box-rook-rail": 750, smothered: 4801,
})
console.log("Legacy Boden/Dovetail exception policy and deterministic regular-course matrix passed.")
