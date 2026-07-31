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
    pedagogicalFamily: raw.pedagogicalFamily ?? raw.learnerCurriculum?.pedagogicalFamily,
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
  const scope = await vite.ssrLoadModule("/src/training/mixedSessionScope.ts")
  const route = await vite.ssrLoadModule("/src/training/autoTrainingRoute.ts")
  const m1Curriculum = await vite.ssrLoadModule("/src/trainers/patternMate/m1LearnerCurriculum.ts")
  const patternMateTrainerSource = await readFile(resolve(root, "src/trainers/patternMate/PatternMateTrainer.tsx"), "utf8")

  const localStorageValues = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (key) => localStorageValues.get(key) ?? null,
      setItem: (key, value) => localStorageValues.set(key, String(value)),
    },
  }
  assert.equal(scope.shouldRevealMixedTheme("identified", false), true, "identified mode exposes the source theme before solving")
  assert.equal(scope.shouldRevealMixedTheme("blind", false), false, "blind mode does not expose the source theme before solving")
  assert.equal(scope.shouldRevealMixedTheme("blind", true), true, "blind mode reveals the source theme after an answer or hint")
  const blindRoute = route.buildAutoTrainingRoute({ route: "/mates/m1/mixed", trainerKey: "mixed-mate-1", mixedPhase: "blind" })
  assert.match(blindRoute, /mixedPhase=blind/, "mixed phase is preserved in route provenance without a source-theme leak")

  const evidenceTrainer = "mixed-mate-test"
  assert.equal(scope.getBlindMixedUnlockStatus(evidenceTrainer).unlocked, false, "blind mixed remains locked below the threshold")
  scope.recordIdentifiedMixedSessionEvidence({ trainerKey: evidenceTrainer, sessionId: "all-themes", scope: "all", phase: "identified", correct: 30, attempts: 30, representedThemes: ["a", "b", "c", "d"] })
  assert.equal(scope.getBlindMixedUnlockStatus(evidenceTrainer).qualifyingSessions, 0, "all-theme practice cannot unlock curriculum blind mixed")
  scope.recordIdentifiedMixedSessionEvidence({ trainerKey: evidenceTrainer, sessionId: "too-narrow", scope: "unlocked", phase: "identified", correct: 30, attempts: 30, representedThemes: ["a", "b", "c"] })
  assert.equal(scope.getBlindMixedUnlockStatus(evidenceTrainer).qualifyingSessions, 0, "sessions with fewer than four eligible themes do not unlock blind mixed")
  scope.recordIdentifiedMixedSessionEvidence({ trainerKey: evidenceTrainer, sessionId: "qualifying-1", scope: "unlocked", phase: "identified", correct: 24, attempts: 30, representedThemes: ["a", "b", "c", "d"] })
  scope.recordIdentifiedMixedSessionEvidence({ trainerKey: evidenceTrainer, sessionId: "qualifying-2", scope: "unlocked", phase: "identified", correct: 25, attempts: 30, representedThemes: ["a", "b", "c", "d"] })
  assert.equal(scope.getBlindMixedUnlockStatus(evidenceTrainer).unlocked, false, "two qualifying identified sessions do not unlock blind mixed")
  scope.recordIdentifiedMixedSessionEvidence({ trainerKey: evidenceTrainer, sessionId: "qualifying-3", scope: "unlocked", phase: "identified", correct: 26, attempts: 30, representedThemes: ["a", "b", "c", "d"] })
  assert.equal(scope.getBlindMixedUnlockStatus(evidenceTrainer).unlocked, true, "three qualifying identified sessions unlock blind mixed locally")

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

  const unlockedScopeThemes = scope.themesForMixedScope({
    area: "mates",
    availableThemes: ["Back Rank", "Arabian", "Anastasia", "Boden"],
    scope: "unlocked",
    curriculum: {
      rating: 700,
      themeMastery: { mates: { "back-rank": { mastered: true }, arabian: { mastered: true } } },
    },
  })
  assert.deepEqual(unlockedScopeThemes, ["back-rank", "arabian"], "default scope includes every available unlocked theme and excludes locked themes")
  const allScopeThemes = scope.themesForMixedScope({
    area: "mates",
    availableThemes: ["Back Rank", "Arabian", "Anastasia", "Boden"],
    scope: "all",
    curriculum: {
      rating: 700,
      themeMastery: { mates: { "back-rank": { mastered: true }, arabian: { mastered: true } } },
    },
  })
  assert.deepEqual(allScopeThemes, ["back-rank", "arabian", "anastasia", "boden"], "all-themes practice retains every available theme without changing unlock state")
  const scopedPlan = selector.planMixedSession(
    fourThemes.map((entry) => ({ ...entry, theme: scope.normaliseMixedThemeKey(entry.theme, "mates") })),
    { sessionId: "unlocked-scope", eligibleThemes: unlockedScopeThemes, sessionSize: 20 },
  )
  assert.equal(scopedPlan.items.length, 10, "a bounded session gracefully uses all available unlocked candidates")
  assert(scopedPlan.orderedCandidates.every((entry) => unlockedScopeThemes.includes(entry.theme)), "the trainer-facing eligible list cannot leak locked themes")
  assertRotation(scopedPlan, 2)

  const oneTheme = selector.planMixedSession(Array.from({ length: 4 }, (_, index) => candidate("hook", index)), { sessionId: "one-theme" })
  assert.equal(oneTheme.items.length, 4, "a one-theme pool remains usable")
  const twoThemes = selector.planMixedSession([candidate("hook", 1), candidate("hook", 2), candidate("boden", 1), candidate("boden", 2)], { sessionId: "two-theme" })
  assertRotation(twoThemes, 2)

  const familyCandidates = [
    { ...candidate("arabian", 1), pedagogicalFamily: "family-a" },
    { ...candidate("back-rank", 1), pedagogicalFamily: "family-a" },
    { ...candidate("anastasia", 1), pedagogicalFamily: "family-b" },
    { ...candidate("boden", 1), pedagogicalFamily: "family-c" },
    { ...candidate("arabian", 2), pedagogicalFamily: "family-d" },
    { ...candidate("back-rank", 2), pedagogicalFamily: "family-e" },
  ]
  const familyPlan = selector.planMixedSession(familyCandidates, { sessionId: "pedagogical-family-rotation", sessionSize: 6 })
  const families = familyPlan.orderedCandidates.map((entry) => entry.pedagogicalFamily)
  for (let index = 1; index < families.length; index += 1) {
    const alternatives = families.slice(index).some((family) => family !== families[index - 1])
    if (alternatives) assert.notEqual(families[index], families[index - 1], "equivalent mirrored pedagogical families cannot be adjacent when alternatives exist")
  }

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

  const mixedMateManifest = JSON.parse(await readFile(resolve(root, "public/data/pattern-mates/mixed/mate-in-1/manifest.json"), "utf8"))
  const mixedMateRecords = (await Promise.all(mixedMateManifest.files.map(async (file) => {
    const raw = JSON.parse(await readFile(resolve(root, `public/data/pattern-mates/mixed/mate-in-1/${file}`), "utf8"))
    return Array.isArray(raw) ? raw : raw.puzzles ?? []
  }))).flat()
  const mixedMateCandidates = mixedMateRecords.map((record) => {
    const entry = rawCandidate(record, "mates", selector)
    return { ...entry, theme: scope.normaliseMixedThemeKey(entry.theme, "mates") }
  })
  const availableMateThemes = [...new Set(mixedMateCandidates.map((entry) => entry.theme))]
  assert(availableMateThemes.length >= 8, "the complete active Mixed Mate M1 pool exposes broad source-theme coverage")
  const allMatePlan = selector.planMixedSession(mixedMateCandidates, {
    sessionId: "mixed-mate-m1-all-themes",
    sessionSize: 20,
  })
  assert.equal(new Set(allMatePlan.orderedCandidates.slice(0, availableMateThemes.length).map((entry) => entry.theme)).size, availableMateThemes.length, "all active M1 mate themes appear before repetition in all-themes mode")
  assertRotation(allMatePlan, availableMateThemes.length)

  const extensionThemes = m1Curriculum.PATTERN_MATE_M1_LEARNER_CURRICULA.filter((definition) =>
    ["kill-box", "dovetail", "double-bishop"].includes(definition.theme),
  )
  assert.equal(extensionThemes.length, 3, "all three extended M1 themes are in the learner curriculum")
  assert.match(patternMateTrainerSource, /config\.trainerKey === "mixed-mate-1"/, "Mixed M1 has a dedicated learner-pool loader")
  assert.match(patternMateTrainerSource, /PATTERN_MATE_M1_LEARNER_CURRICULA/, "Mixed M1 loads the versioned learner pools rather than the generated source pool")
  const curatedCandidates = (await Promise.all(extensionThemes.map(async (definition) => {
    const manifest = JSON.parse(await readFile(resolve(root, `public${definition.learnerDataBasePath}/manifest.json`), "utf8"))
    assert.equal(manifest.files.length, 5, `${definition.theme} exposes five learner chunks to mixed practice`)
    const chunks = await Promise.all(manifest.files.map(async (file) => {
      const raw = JSON.parse(await readFile(resolve(root, `public${definition.learnerDataBasePath}/${file}`), "utf8"))
      return (raw.puzzles ?? raw).map((record) => {
        const entry = rawCandidate(record, "mates", selector)
        return { ...entry, theme: scope.normaliseMixedThemeKey(entry.theme, "mates") }
      })
    }))
    return chunks.flat()
  }))).flat()
  const curatedPlan = selector.planMixedSession(curatedCandidates, { sessionId: "curated-m1-extension", sessionSize: 20 })
  assertRotation(curatedPlan, 3)
  const curatedFamilies = curatedPlan.orderedCandidates.map((entry) => entry.pedagogicalFamily)
  for (let index = 1; index < curatedFamilies.length; index += 1) {
    const alternatives = curatedFamilies.slice(index).some((family) => family && family !== curatedFamilies[index - 1])
    if (alternatives) assert.notEqual(curatedFamilies[index], curatedFamilies[index - 1], "curated mixed M1 keeps equivalent families apart when alternatives exist")
  }

  console.log("PASS: deterministic mixed-theme rotation, balance, canonical recency, and one/two-theme fallbacks")
  console.log("PASS: every active mixed Pattern Mate and Pattern Tactic chunk can be reordered without duplicate canonical exercises")
  console.log("PASS: curriculum ceilings remain enforced before mixed-session selection")
  console.log("PASS: unlocked and all-theme scopes preserve eligibility, balance, and deterministic diversity")
  console.log("PASS: curated M1 learner pools preserve theme rotation and pedagogical-family separation in mixed sessions")
  console.log(`EXAMPLE: ${exampleSequence.join(" -> ")}`)
} finally {
  await vite.close()
}
