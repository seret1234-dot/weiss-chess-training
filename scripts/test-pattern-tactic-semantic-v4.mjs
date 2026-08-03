import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createServer } from "vite"

const root = process.cwd()
const learnerRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const coverage = JSON.parse(fs.readFileSync(path.join(root, "docs", "reviews", "pattern-tactic-semantic-v4-coverage.json"), "utf8"))
const list = (value) => Array.isArray(value) ? value : value?.puzzles ?? []

for (const row of coverage.coverage) {
  const folder = `${row.canonicalThemeKey}-m${row.stage}-${row.validationVersion}`
  const manifest = JSON.parse(fs.readFileSync(path.join(learnerRoot, folder, "manifest.json"), "utf8"))
  assert.equal(Boolean(manifest.unavailable), row.unavailable, `${row.canonicalThemeKey} M${row.stage} availability is explicit`)
  assert.ok(!row.focusedTraining || /^semantic-v[23]$/.test(row.validationVersion), `${row.canonicalThemeKey} M${row.stage} uses an approved semantic overlay`)
  assert.ok(row.unavailable || row.retained >= 20, `${row.canonicalThemeKey} M${row.stage} is unavailable below the reviewed-material threshold`)
  assert.ok(row.chunks <= (row.stage === 1 ? 5 : 8), `${row.canonicalThemeKey} M${row.stage} respects learner chunk caps`)
  for (const file of manifest.files ?? []) for (const puzzle of list(JSON.parse(fs.readFileSync(path.join(learnerRoot, folder, file), "utf8")))) {
    assert.equal(puzzle.semanticAudit?.status, "VALID", `${row.canonicalThemeKey} M${row.stage} retains only validator-approved records`)
  }
}

for (const mixed of coverage.mixed) {
  const manifest = JSON.parse(fs.readFileSync(path.join(learnerRoot, `mixed-m${mixed.stage}-semantic-v4`, "manifest.json"), "utf8"))
  assert.deepEqual(manifest.sourceThemes, mixed.sourceThemes, `mixed M${mixed.stage} has deterministic approved contributors`)
  assert.deepEqual(manifest.contributionCounts, mixed.contributionCounts, `mixed M${mixed.stage} contribution counts match coverage`)
  assert.ok(manifest.sourceThemes.every((theme) => coverage.coverage.some((row) => row.stage === mixed.stage && row.canonicalThemeKey === theme && row.focusedTraining)), `mixed M${mixed.stage} excludes unverified themes`)
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
try {
  const curriculum = await vite.ssrLoadModule("/src/trainers/patternTactic/m1toM4LearnerCurriculum.ts")
  for (const row of coverage.coverage) {
    const definition = curriculum.getPatternTacticLearnerCurriculum(`tactic-${row.canonicalThemeKey}-m${row.stage}`)
    assert.equal(Boolean(definition?.unavailableReason), row.unavailable, `${row.canonicalThemeKey} M${row.stage} route cannot fall back to raw v1`)
  }
} finally {
  await vite.close()
}

console.log("PASS: semantic-v4 coverage fails closed for every unverified Pattern Tactic course and mixed pools contain approved overlays only")
