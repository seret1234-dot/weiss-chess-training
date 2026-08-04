import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createServer } from "vite"

const root = process.cwd()
const learnerRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const list = (value) => Array.isArray(value) ? value : value?.puzzles ?? []
const specialLabels = { "en-passant": "En passant", "knight-underpromotion": "Knight Underpromotion" }
const labelFor = (key) => specialLabels[key] ?? key.split("-").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ")
const issue = (kind, puzzle, directory, expected, actual) => ({ kind, id: puzzle.id ?? puzzle.localId ?? puzzle.puzzleId, directory, expected, actual })

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
try {
  const curriculum = await vite.ssrLoadModule("/src/trainers/patternTactic/m1toM4LearnerCurriculum.ts")
  const active = curriculum.PATTERN_TACTIC_M1_TO_M4_LEARNER_CURRICULA.filter((definition) => definition.activeChunkCount > 0)
  const records = []
  for (const definition of active) {
    const directory = path.basename(definition.learnerDataBasePath)
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "public", definition.learnerDataBasePath, "manifest.json"), "utf8"))
    for (const file of manifest.files ?? []) for (const puzzle of list(JSON.parse(fs.readFileSync(path.join(root, "public", definition.learnerDataBasePath, file), "utf8")))) {
      records.push({ puzzle, directory, expectedKey: definition.canonicalThemeKey })
    }
  }
  for (const stage of [1, 2, 3, 4]) {
    const directory = `mixed-m${stage}-semantic-v4`
    const manifest = JSON.parse(fs.readFileSync(path.join(learnerRoot, directory, "manifest.json"), "utf8"))
    for (const file of manifest.files ?? []) for (const puzzle of list(JSON.parse(fs.readFileSync(path.join(learnerRoot, directory, file), "utf8")))) {
      records.push({ puzzle, directory, expectedKey: puzzle.canonicalThemeKey })
    }
  }

  const mismatches = []
  const expectedEvidence = (key) => {
    if (key.includes("fork")) return "targets"
    if (key.includes("skewer")) return "skewers"
    if (key.includes("pin")) return "pins"
    if (key === "discovered-attack" || key === "discovered-check" || key === "double-check") return "revealed"
    if (key.includes("promotion")) return "promotion"
    if (key === "en-passant") return "move"
    return null
  }
  for (const { puzzle, directory, expectedKey } of records) {
    const actualKey = puzzle.canonicalThemeKey
    const actualLabel = puzzle.canonicalThemeLabel
    if (!actualKey) mismatches.push(issue("missing-key", puzzle, directory, expectedKey, actualKey))
    else if (actualKey !== expectedKey) mismatches.push(issue("wrong-key", puzzle, directory, expectedKey, actualKey))
    if (actualKey && actualLabel !== labelFor(actualKey)) mismatches.push(issue("wrong-label", puzzle, directory, labelFor(actualKey), actualLabel))
    const detected = String(puzzle.semanticAudit?.detectedTheme ?? "").toLowerCase()
    if (actualKey?.includes("fork") && detected && !detected.includes("fork")) mismatches.push(issue("fork-semantic", puzzle, directory, "fork", detected))
    if (actualKey?.includes("skewer") && detected && !detected.includes("skewer")) mismatches.push(issue("skewer-semantic", puzzle, directory, "skewer", detected))
    const evidenceField = actualKey ? expectedEvidence(actualKey) : null
    if (evidenceField && !(evidenceField in (puzzle.semanticAudit?.evidence ?? {}))) {
      mismatches.push(issue("wrong-evidence", puzzle, directory, evidenceField, Object.keys(puzzle.semanticAudit?.evidence ?? {}).join(",")))
    }
  }
  assert.deepEqual(mismatches, [], `canonical tactic attribution mismatches: ${JSON.stringify(mismatches.slice(0, 20))}`)

  const trainer = fs.readFileSync(path.join(root, "src", "trainers", "patternTactic", "PatternTacticTrainer.tsx"), "utf8")
  assert.match(trainer, /formatPatternTacticThemeLabel\(normaliseMixedThemeKey/, "display labels are derived from canonical keys, not raw tags")
  assert.match(trainer, /v4-attribution:/, "mixed-session cache IDs reject old mislabeled plans")
  assert.match(trainer, /shouldRevealMixedTheme\(mixedPhase, blindThemeRevealed\)/, "identified and blind disclosure share the canonical displayed theme")
  console.log(`PASS: ${records.length} active focused/mixed tactic records retain canonical overlay attribution`)
} finally {
  await vite.close()
}
