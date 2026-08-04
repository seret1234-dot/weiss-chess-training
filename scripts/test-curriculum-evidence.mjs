import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
try {
  const completion = await vite.ssrLoadModule("/src/training/curriculum/curriculumCompletion.ts")
  const events = await vite.ssrLoadModule("/src/training/curriculum/curriculumEvents.ts")
  const catalog = await vite.ssrLoadModule("/src/training/curriculum/curriculumCatalog.ts")
  const selector = await vite.ssrLoadModule("/src/training/curriculum/selectCurriculumItem.ts")
  const mateTrainer = await readFile(new URL("../src/trainers/patternMate/PatternMateTrainer.tsx", import.meta.url), "utf8")
  const tacticTrainer = await readFile(new URL("../src/trainers/patternTactic/PatternTacticTrainer.tsx", import.meta.url), "utf8")
  const persistence = await readFile(new URL("../src/training/curriculum/curriculumPersistence.ts", import.meta.url), "utf8")

  const focused = {
    userId: "user-a", area: "mates", stageOrder: 1, canonicalTheme: "back-rank",
    trainerKey: "back-rank-mate-1", learnerVersion: "m1-learner-v2", learnerChunk: 1,
    route: "/mates/m1/back-rank", sessionId: "session-a", decisionId: "decision-1",
    eventKind: "focused", attempts: 20, correctAttempts: 16, hintCount: 1, averageSolveMs: 20_000,
  }
  assert.equal(completion.isCurriculumCompletionEligible(focused), true, "focused learner completion is eligible")
  assert.equal(completion.curriculumCompletionIdempotencyKey(focused), completion.curriculumCompletionIdempotencyKey({ ...focused }), "the same completed chunk has one deterministic idempotency key")
  assert.notEqual(completion.curriculumCompletionIdempotencyKey(focused), completion.curriculumCompletionIdempotencyKey({ ...focused, sessionId: "session-b" }), "a later session has a distinct key")
  assert.match(persistence, /if \(existing\) return \{ data: existing, created: false \}/, "a retry receives the existing evidence without recounting it")
  assert.equal(completion.isCurriculumCompletionEligible({ ...focused, mixedScope: "all" }), false, "Practice all cannot write curriculum evidence")
  assert.equal(completion.isCurriculumCompletionEligible({ ...focused, userId: null }), false, "guests cannot write curriculum evidence")
  assert.equal(completion.isCurriculumCompletionEligible({ ...focused, attempts: 0 }), false, "a hint or solution without a completed session cannot write evidence")

  const aggregate = events.aggregateCurriculumEvents([
    { ...focused, idempotencyKey: "one", eventKind: "focused", occurredOn: "2026-08-01" },
    { ...focused, idempotencyKey: "two", eventKind: "focused", correctAttempts: 8, hintCount: 5, occurredOn: "2026-08-02" },
  ])
  assert.equal(aggregate.attempts, 40, "wrong attempts contribute to aggregate attempts")
  assert.equal(aggregate.correctAttempts, 24, "first-attempt correctness is retained")
  assert.equal(aggregate.hintCount, 6, "hint usage contributes to aggregate evidence")
  assert.equal(events.regressionReason("mates", aggregate, { rating: 600, activeStages: { mates: 1 } }, []), "low_accuracy", "failure evidence activates reinforcement")
  assert.equal(events.isThemeMastered(aggregate), false, "a low-accuracy chunk completion cannot grant mastery")

  const identified = Array.from({ length: 3 }, (_, index) => ({
    ...focused, idempotencyKey: `identified-${index}`, eventKind: "mixed", attempts: 30, correctAttempts: 24, occurredOn: `2026-08-0${index + 1}`,
  }))
  assert.equal(events.aggregateCurriculumEvents(identified).mixedAttempts, 90, "identified mixed evidence remains distinguishable as mixed")
  const blind = { ...identified[0], idempotencyKey: "blind", eventKind: "review" }
  assert.equal(events.aggregateCurriculumEvents([blind]).mixedAttempts, 0, "blind review is not credited as identified mixed evidence")
  assert.equal(events.aggregateCurriculumEvents([...identified, blind]).mixedAttempts, 90, "blind evidence cannot inflate the identified-mixed unlock count")

  const firstTen = Array.from({ length: 10 }, (_, selectionIndex) => selector.selectCurriculumItem({ state: { rating: 600 }, area: "tactics", selectionIndex }))
  assert.equal(firstTen.filter((decision) => decision.kind === "preview").length, 1, "one evidence-advanced ordinal cycle preserves the 9-current/1-preview split")
  assert(catalog.getCurriculumItems("tactics").every((item) => item.available), "unavailable semantic-v4 tactics never enter the catalog")
  assert.match(mateTrainer, /recordNormalizedCurriculumCompletion/, "Pattern Mate uses the shared completion adapter")
  assert.match(tacticTrainer, /recordNormalizedCurriculumCompletion/, "Pattern Tactic uses the shared completion adapter")
  assert.match(mateTrainer, /curriculumCompletionInFlightRef/, "Pattern Mate prevents double completion writes from timers or clicks")
  assert.match(tacticTrainer, /curriculumCompletionInFlightRef/, "Pattern Tactic prevents double completion writes from timers or clicks")
  assert.match(mateTrainer, /mixedScope !== "all"|mixedScope/, "Pattern Mate passes the practice scope to the adapter")
  assert.match(tacticTrainer, /tacticLearnerCurriculum\?\.unavailableReason/, "Unavailable semantic-v4 tactics cannot enter a completion flow")
  assert.match(persistence, /onConflict: "user_id,idempotency_key"/, "persistence upserts a deterministic session key")
  assert.match(persistence, /updateAreaProgressAfterStage/, "persisted stage completion can advance the next deterministic decision")
  assert.match(mateTrainer, /Chunk completed/, "Pattern Mate renders the completion card")
  assert.match(tacticTrainer, /Chunk completed/, "Pattern Tactic renders the completion card")

  function makeFailureInjectableDependencies(failOnce = {}) {
    const evidence = new Map()
    const calls = { theme: 0, stage: 0, area: 0, reinforcement: 0 }
    const fail = { ...failOnce }
    const maybeFail = (name) => {
      if (!fail[name]) return
      fail[name] -= 1
      throw new Error(`${name} write failed once`)
    }
    return {
      evidence,
      calls,
      dependencies: {
        getOrCreate: async () => null,
        recordEvidence: async (event) => {
          const existing = evidence.get(event.idempotencyKey)
          if (existing) return { data: existing, created: false }
          evidence.set(event.idempotencyKey, event)
          if (fail.responseLost) {
            fail.responseLost -= 1
            throw new Error("network response lost after insert")
          }
          return { data: event, created: true }
        },
        updateTheme: async () => { calls.theme += 1; maybeFail("theme"); return { permanentMastery: true } },
        updateStage: async () => { calls.stage += 1; maybeFail("stage"); return { permanentMastery: true } },
        updateArea: async () => { calls.area += 1; maybeFail("area"); return { advanced: true } },
        updateReinforcement: async () => { calls.reinforcement += 1; maybeFail("reinforcement"); return { active: false } },
      },
    }
  }

  for (const failedAggregate of ["theme", "stage", "area"]) {
    const fake = makeFailureInjectableDependencies({ [failedAggregate]: 1 })
    const first = await completion.recordNormalizedCurriculumCompletion(focused, fake.dependencies)
    assert.equal(first.evidenceNew, true, `${failedAggregate} failure still preserves the newly inserted evidence`)
    assert.equal(first.reconciled, false, `${failedAggregate} failure reports incomplete reconciliation`)
    assert.equal(fake.evidence.size, 1, `${failedAggregate} failure writes exactly one evidence record`)
    const retry = await completion.recordNormalizedCurriculumCompletion(focused, fake.dependencies)
    assert.equal(retry.evidenceNew, false, `${failedAggregate} retry finds the same durable evidence`)
    assert.equal(retry.reconciled, true, `${failedAggregate} retry repairs derived aggregates`)
    assert.equal(fake.evidence.size, 1, `${failedAggregate} retry cannot advance the evidence ordinal twice`)
  }

  const lostResponse = makeFailureInjectableDependencies({ responseLost: 1 })
  await assert.rejects(() => completion.recordNormalizedCurriculumCompletion(focused, lostResponse.dependencies), /response lost/, "a lost response after insert is observable to the caller")
  const afterLostResponse = await completion.recordNormalizedCurriculumCompletion(focused, lostResponse.dependencies)
  assert.equal(afterLostResponse.evidenceNew, false, "retry after a lost response does not duplicate evidence")
  assert.equal(afterLostResponse.reconciled, true, "retry after a lost response reconciles aggregates")
  assert.equal(lostResponse.evidence.size, 1, "selection ordinal advances exactly once after a lost response")

  const hydrationRepair = makeFailureInjectableDependencies()
  const repaired = await completion.reconcileNormalizedCurriculumCompletion(focused, hydrationRepair.dependencies)
  assert.equal(repaired.reconciled, true, "hydration can rebuild stale aggregate rows from durable completion provenance")
  assert.equal(repaired.masteryIncreased, true, "reconciliation preserves permanent mastery rather than clearing it")
  assert.equal(hydrationRepair.calls.theme, 1, "hydration reconciliation repairs focused theme aggregates")
  assert.equal(hydrationRepair.calls.stage, 1, "hydration reconciliation repairs stage aggregates")
  assert.equal(hydrationRepair.calls.area, 1, "hydration reconciliation repairs area aggregates")
  assert.match(persistence, /reconcileCurriculumState/, "runtime hydration has a persisted-evidence reconciliation path")
  assert.match(mateTrainer, /startChunkMasterySave/, "legacy chunk progress save remains present if curriculum persistence fails")
  assert.match(tacticTrainer, /startChunkMasterySave/, "legacy tactic progress save remains present if curriculum persistence fails")
  console.log("PASS: Phase 3.2 evidence normalization, idempotency, aggregate mastery, reinforcement, and trainer integration")
} finally {
  await vite.close()
}
