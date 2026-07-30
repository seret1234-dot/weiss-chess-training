import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createServer } from "vite"

const root = process.cwd()
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

function candidate(theme, index, canonical = `${theme}-${index}`) {
  return {
    item: { theme, index },
    theme,
    canonicalIdentity: canonical,
    stableId: `${theme}-${index}`,
  }
}

function assertRotation(plan, eligibleThemeCount) {
  const themes = plan.orderedCandidates.map((entry) => entry.theme)
  const canonical = plan.orderedCandidates.map((entry) => entry.canonicalIdentity)
  assert.equal(new Set(canonical).size, canonical.length, "canonical identities cannot repeat in a session")
  if (eligibleThemeCount >= 2) {
    for (let index = 1; index < themes.length; index += 1) {
      const remainingThemes = new Set(themes.slice(index))
      if (remainingThemes.size >= 2) {
        assert.notEqual(themes[index], themes[index - 1], "two or more available themes cannot repeat consecutively")
      }
    }
  }
  if (eligibleThemeCount >= 4) {
    for (let index = 3; index < themes.length; index += 1) {
      const recent = themes.slice(index - 3, index)
      const alternatives = themes.slice(index).filter((theme) => !recent.includes(theme))
      if (alternatives.length > 0) {
        assert(!recent.includes(themes[index]), "four or more themes avoid the previous-three queue when possible")
      }
    }
  }
}

function rawCandidate(raw, family, selector) {
  const sourceIdentity = String(raw.puzzleId ?? raw.lichessId ?? raw.lichess_id ?? raw.PuzzleId ?? raw.localId ?? raw.id)
  const theme = family === "mates"
    ? raw.sourceThemeTag ?? raw.sourceTheme ?? raw.theme ?? "other"
    : raw.sourceThemeKeys?.[0] ?? raw.sourceTheme ?? raw.theme ?? "other"
  return {
    item: raw,
    theme,
    stableId: String(raw.id ?? sourceIdentity),
    canonicalIdentity: selector.createCanonicalExerciseIdentity({
      fen: raw.fen ?? raw.FEN,
      preMove: raw.preMove,
      objective: family,
      solutionLine: raw.solutionLine ?? raw.moves ?? raw.solution ?? [],
      sourceIdentity,
    }),
  }
}

try {
  const selector = await vite.ssrLoadModule("/src/training/mixedSessionSelector.ts")
  const curriculum = await vite.ssrLoadModule("/src/training/curriculum/selectCurriculumItem.ts")

  const fourThemes = ["back-rank", "anastasia", "arabian", "boden"].flatMap((theme) =>
    Array.from({ length: 5 }, (_, index) => candidate(theme, index)),
  )
  const first = selector.planMixedSession(fourThemes, { sessionId: "four-theme-session" })
  const repeat = selector.planMixedSession(fourThemes, { sessionId: "four-theme-session" })
  assert.deepEqual(
    first.orderedCandidates.map((entry) => entry.stableId),
    repeat.orderedCandidates.map((entry) => entry.stableId),
    "identical state, session id, and pool produce identical order",
  )
  assertRotation(first, 4)
  assert.equal(new Set(first.orderedCandidates.slice(0, 4).map((entry) => entry.theme)).size, 4, "all themes appear before repetition")
  const cap = Math.ceil(first.items.length / 4) + 1
  assert(Object.values(first.themeCounts).every((count) => count <= cap), "theme counts stay within the balance cap")
  const exampleSequence = first.orderedCandidates.map((entry) => entry.theme).slice(0, 20)

  const locked = selector.planMixedSession(fourThemes, {
    sessionId: "locked-theme-session",
    eligibleThemes: ["back-rank", "arabian"],
  })
  assert(locked.orderedCandidates.every((entry) => entry.theme === "back-rank" || entry.theme === "arabian"), "locked themes never enter the selected session")
  assertRotation(locked, 2)

  const oneTheme = selector.planMixedSession(Array.from({ length: 4 }, (_, index) => candidate("hook", index)), { sessionId: "one-theme" })
  assert.equal(oneTheme.items.length, 4, "a one-theme pool remains usable")
  const twoThemes = selector.planMixedSession([candidate("hook", 1), candidate("hook", 2), candidate("boden", 1), candidate("boden", 2)], { sessionId: "two-theme" })
  assertRotation(twoThemes, 2)

  const history = selector.planMixedSession(fourThemes, {
    sessionId: "history-aware",
    recentlySeenCanonicalIdentities: first.orderedCandidates.slice(0, 4).map((entry) => entry.canonicalIdentity),
  })
  assert(!history.orderedCandidates.slice(0, 4).some((entry) => first.orderedCandidates.slice(0, 4).some((seen) => seen.canonicalIdentity === entry.canonicalIdentity)), "recent canonical identities are avoided when alternatives exist")

  const state = { rating: 600, activeStages: { mates: 1, tactics: 1 }, difficultyCeilings: { mates: 1, tactics: 1 } }
  for (const area of ["mates", "tactics"]) {
    const eligible = curriculum.getEligibleCurriculumItems(state, area)
    assert(eligible.every((item) => item.stageOrder <= 1), `${area} selection never exceeds its difficulty ceiling before mixed-session rotation`)
  }

  const sources = [
    ["mates", "/data/pattern-mates/mixed/mate-in-1"],
    ["mates", "/data/pattern-mates/mixed/mate-in-2"],
    ["mates", "/data/pattern-mates/mixed/mate-in-3"],
    ["mates", "/data/pattern-mates/mixed/mate-in-4"],
    ["mates", "/data/pattern-mates/mixed/mate-in-5"],
    ["tactics", "/data/pattern-tactics/mixed/m1"],
    ["tactics", "/data/pattern-tactics/mixed/m2"],
    ["tactics", "/data/pattern-tactics/mixed/m3"],
    ["tactics", "/data/pattern-tactics/mixed/m4"],
  ]
  for (const [family, basePath] of sources) {
    const manifest = JSON.parse(await readFile(resolve(root, `public${basePath}/manifest.json`), "utf8"))
    for (const file of manifest.files) {
      const raw = JSON.parse(await readFile(resolve(root, `public${basePath}/${file}`), "utf8"))
      const records = Array.isArray(raw) ? raw : raw.puzzles ?? []
      const candidates = records.map((record) => rawCandidate(record, family, selector))
      const plan = selector.planMixedSession(candidates, { sessionId: `${family}:${basePath}:${file}` })
      assert.equal(plan.items.length, new Set(candidates.map((entry) => entry.canonicalIdentity)).size, `${basePath}/${file} preserves one occurrence per canonical identity`)
      const availableThemes = new Set(plan.orderedCandidates.map((entry) => entry.theme)).size
      assertRotation(plan, availableThemes)
    }
  }

  console.log("PASS: deterministic mixed-theme rotation, balance, canonical recency, and one/two-theme fallbacks")
  console.log("PASS: every active mixed Pattern Mate and Pattern Tactic chunk can be reordered without duplicate canonical exercises")
  console.log("PASS: curriculum ceilings remain enforced before mixed-session selection")
  console.log(`EXAMPLE: ${exampleSequence.join(" -> ")}`)
} finally {
  await vite.close()
}
