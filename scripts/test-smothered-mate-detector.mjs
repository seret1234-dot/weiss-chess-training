import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Chess } from "chess.js"
import { detectSmotheredMate, detectSmotheredMateAtTerminal, replayPuzzleToTerminal } from "./lib/detect-smothered-mate.mjs"

const root = process.cwd()
const pattern = (theme, distance) => `public/data/pattern-mates/${theme}/mate-in-${distance}`
const lichess = (distance, theme) => `public/data/lichess/mate_in_${distance}/${theme}`

const regularCourses = {
  smothered: [1, 2, 3, 4].map((distance) => ({ distance, directory: pattern("smothered", distance) })),
  "back-rank": [
    { distance: 1, directory: lichess(1, "back_rank") },
    ...[2, 3, 4, 5].map((distance) => ({ distance, directory: pattern("back-rank", distance) })),
  ],
  anastasia: [1, 2, 3, 4, 5].map((distance) => ({ distance, directory: lichess(distance, "anastasia") })),
  arabian: [1, 2, 3, 4, 5].map((distance) => ({ distance, directory: pattern("arabian", distance) })),
  boden: [1, 2, 3].map((distance) => ({ distance, directory: pattern("boden", distance) })),
  hook: [1, 2, 3, 4, 5].map((distance) => ({ distance, directory: pattern("hook", distance) })),
  dovetail: [1, 2, 3, 4, 5].map((distance) => ({ distance, directory: pattern("dovetail", distance) })),
  "double-bishop": [1, 2, 3].map((distance) => ({ distance, directory: pattern("double-bishop", distance) })),
  "kill-box-adjacent-rook": [1, 2, 3, 4, 5].map((distance) => ({ distance, directory: pattern("kill-box-adjacent-rook", distance) })),
  "kill-box-rook-rail": [1, 2, 3, 4, 5].map((distance) => ({ distance, directory: pattern("kill-box-rook-rail", distance) })),
  "kill-box-queen-fence": [1, 2, 3, 4, 5].map((distance) => ({ distance, directory: pattern("kill-box-queen-fence", distance) })),
}

async function recordsAt(directory) {
  const manifest = JSON.parse(await readFile(resolve(root, directory, "manifest.json"), "utf8"))
  const records = []
  for (const file of manifest.files) {
    const payload = JSON.parse(await readFile(resolve(root, directory, file), "utf8"))
    records.push(...(Array.isArray(payload) ? payload : payload.puzzles ?? []))
  }
  assert.equal(records.length, manifest.totalPuzzles, `${directory} must contain its manifest total`)
  return records
}

async function recordsFor(course) {
  const groups = []
  for (const entry of regularCourses[course]) groups.push({ ...entry, records: await recordsAt(entry.directory) })
  return groups
}

function idOf(record) {
  const id = record.puzzleId ?? record.id ?? record.lichessId ?? record.localId
  assert.ok(id, "every validated regular-course record needs a stable ID")
  return String(id)
}

function resultSummary(result) {
  return result.matched ? "MATCH" : result.reason
}

const smotheredGroups = await recordsFor("smothered")
const smotheredRows = []
const seenSmotheredIds = new Set()
const missesByReason = new Map()
for (const group of smotheredGroups) {
  let matched = 0
  const misses = []
  for (const record of group.records) {
    assert.ok(!seenSmotheredIds.has(idOf(record)), `duplicate Smothered puzzle ${idOf(record)}`)
    seenSmotheredIds.add(idOf(record))
    const result = detectSmotheredMate(record)
    if (result.matched) matched += 1
    else {
      misses.push({ id: idOf(record), reason: resultSummary(result), error: result.error ?? null })
      missesByReason.set(resultSummary(result), (missesByReason.get(resultSummary(result)) ?? 0) + 1)
    }
  }
  smotheredRows.push({ distance: group.distance, labelled: group.records.length, matched, missed: misses.length, recall: group.records.length ? matched / group.records.length : 0, misses })
}

const totalLabelled = smotheredRows.reduce((total, row) => total + row.labelled, 0)
const totalMatched = smotheredRows.reduce((total, row) => total + row.matched, 0)
const totalMissed = totalLabelled - totalMatched

// These are the complete active regular-course source totals. A change means
// the audit needs review rather than silently narrowing the corpus.
assert.deepEqual(smotheredRows.map(({ distance, labelled }) => [distance, labelled]), [[1, 1500], [2, 1500], [3, 1500], [4, 301]])
assert.equal(totalLabelled, 4801)
assert.equal(seenSmotheredIds.size, 4801)
assert.equal(totalMatched, 4801, "The faithful upstream port must retain complete regular Smothered recall")
assert.equal(totalMissed, 0, "The complete labelled regular Smothered corpus must have no unexplained misses")

const crossTheme = {}
const crossThemeExamples = {}
for (const course of Object.keys(regularCourses).filter((course) => course !== "smothered")) {
  const groups = await recordsFor(course)
  const ids = new Set()
  const matches = []
  let nonTerminalRecords = 0
  for (const group of groups) {
    for (const record of group.records) {
      assert.ok(!ids.has(idOf(record)), `${course} duplicates ${idOf(record)}`)
      ids.add(idOf(record))
      const result = detectSmotheredMate(record)
      assert.notEqual(result.reason, "REPLAY_ERROR", `${course} ${idOf(record)} must replay its stored timeline`)
      if (result.reason === "NOT_CHECKMATE") nonTerminalRecords += 1
      if (result.matched) matches.push({ id: idOf(record), distance: group.distance, evidence: result.evidence })
    }
  }
  crossTheme[course] = { positions: ids.size, smotheredMatches: matches.length, nonTerminalRecords }
  if (matches.length) crossThemeExamples[course] = matches.slice(0, 10)
}

assert.deepEqual(crossTheme, {
  "back-rank": { positions: 9886, smotheredMatches: 0, nonTerminalRecords: 0 },
  anastasia: { positions: 5118, smotheredMatches: 0, nonTerminalRecords: 0 },
  arabian: { positions: 3754, smotheredMatches: 0, nonTerminalRecords: 0 },
  boden: { positions: 2831, smotheredMatches: 0, nonTerminalRecords: 0 },
  hook: { positions: 4214, smotheredMatches: 0, nonTerminalRecords: 0 },
  dovetail: { positions: 2726, smotheredMatches: 0, nonTerminalRecords: 0 },
  "double-bishop": { positions: 2858, smotheredMatches: 0, nonTerminalRecords: 0 },
  "kill-box-adjacent-rook": { positions: 2553, smotheredMatches: 0, nonTerminalRecords: 0 },
  "kill-box-rook-rail": { positions: 750, smotheredMatches: 0, nonTerminalRecords: 0 },
  "kill-box-queen-fence": { positions: 511, smotheredMatches: 0, nonTerminalRecords: 0 },
}, "The regular course cross-theme matrix must remain understood and stable")

// Permanent corpus fixtures: representative labelled positives at each active
// distance, selected deterministically from the first matching record.
const representativeFixtures = [
  { distance: 1, id: "3YAcJ", fen: "2rq1rk1/p3np1p/b5p1/2pp4/8/PP1nPNP1/2RN1PBP/3Q1R1K w - - 5 18", preMove: "f1g1", solutionLine: ["d3f2"] },
  { distance: 2, id: "xAwG2", fen: "7k/p5pp/1ppNb3/3p4/1P6/2P4P/r5P1/5R1K b - - 1 34", preMove: "a2c2", solutionLine: ["f1f8", "e6g8", "d6f7"] },
  { distance: 3, id: "g4SNp", fen: "3r2k1/1Q4pp/5p2/2b5/P2r1Pn1/7N/6PP/R1R4K w - - 5 34", preMove: "c1c5", solutionLine: ["d4d1", "a1d1", "d8d1", "h3g1", "g4f2"] },
  { distance: 4, id: "wwhbD", fen: "r5k1/p3n1pp/1q1N4/1p6/2p2Q2/1BPb4/PP4PP/5R1K b - - 4 21", preMove: "c4b3", solutionLine: ["f4f7", "g8h8", "f7f8", "a8f8", "f1f8", "e7g8", "d6f7"] },
]
for (const record of representativeFixtures) {
  const result = detectSmotheredMate(record)
  assert.equal(result.matched, true, `Smothered fixture ${idOf(record)} matches`)
  assert.equal(result.theme, "smothered")
  assert.ok(result.evidence.matingKnightSquare)
  assert.ok(result.evidence.blockers.every(({ piece }) => piece?.color === result.evidence.matedColor))
}

// A regular non-Smothered mate with no checking knight proves that a boxed
// king or any other mating piece cannot satisfy the upstream predicate.
const noKnightRecord = {
  id: "04uFj",
  fen: "5r2/ppp3pk/1b5p/4N3/3P4/2P5/PP4PP/4Rq1K w - - 4 27",
  preMove: "e1f1",
  moves: ["e1f1", "f8f1"],
}
assert.equal(detectSmotheredMate(noKnightRecord).matched, false)
assert.equal(detectSmotheredMate(noKnightRecord).reason, "NO_CHECKING_KNIGHT")

// A legal double-check mate with a knight checker is deliberately excluded
// because g1 is empty: the upstream predicate requires every king neighbor to
// be occupied by the mated side, even when another checker controls it.
const knightMateNotFullySmothered = new Chess("k7/8/8/8/8/8/5nPP/3q3K w - - 0 1")
assert.equal(knightMateNotFullySmothered.isCheckmate(), true)
assert.equal(detectSmotheredMateAtTerminal(knightMateNotFullySmothered).reason, "KING_NEIGHBORHOOD_NOT_FULLY_MATED_SIDE")

// These legal in-check positions establish the upstream mate_in precondition:
// the first has a king escape square and the second lets a defending rook
// capture the checking knight. Local knight geometry alone must not match.
const escapeSquare = new Chess("k7/8/8/8/8/8/5nPP/7K w - - 0 1")
assert.equal(escapeSquare.isCheckmate(), false)
assert.equal(detectSmotheredMateAtTerminal(escapeSquare).reason, "NOT_CHECKMATE")
const capturableKnight = new Chess("k7/8/8/8/8/8/5nPP/5R1K w - - 0 1")
assert.equal(capturableKnight.isCheckmate(), false)
assert.equal(detectSmotheredMateAtTerminal(capturableKnight).reason, "NOT_CHECKMATE")

// The shared replay helper accepts every UCI mechanism that can appear in a
// persisted puzzle line. These compact legal timelines are representation
// regressions only; they deliberately make no mate-theme claim.
const promotionReplay = replayPuzzleToTerminal({
  id: "promotion-replay",
  fen: "7k/P7/8/8/8/8/8/K7 w - - 0 1",
  solutionLine: ["a7a8q"],
})
assert.equal(promotionReplay.game.get("a8")?.type, "q")
const castlingReplay = replayPuzzleToTerminal({
  id: "castling-replay",
  fen: "4k3/8/8/8/8/8/8/4K2R w K - 0 1",
  solutionLine: ["e1g1"],
})
assert.equal(castlingReplay.game.get("g1")?.type, "k")
assert.equal(castlingReplay.game.get("f1")?.type, "r")
const enPassantReplay = replayPuzzleToTerminal({
  id: "en-passant-replay",
  fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",
  solutionLine: ["e5d6"],
})
assert.equal(enPassantReplay.game.get("d6")?.type, "p")
assert.equal(enPassantReplay.game.get("d5"), undefined)

// Replaying representative source records is the regression coverage for
// captures/promotions/castling/en-passant: chess.js must accept their stored
// UCI form when they occur. The corpus-wide replay also checks every source
// solution line and fails closed on any malformed representation.
for (const group of smotheredGroups) {
  for (const record of group.records) {
    const result = detectSmotheredMate(record)
    assert.notEqual(result.reason, "REPLAY_ERROR", `Smothered ${idOf(record)} must replay`)
    const replay = replayPuzzleToTerminal(record)
    assert.equal(replay.game.isCheckmate(), true, `Smothered ${idOf(record)} must end in legal checkmate`)
  }
}

const report = {
  upstreamContract: "terminal legal checkmate; an attacking knight checks the mated king; every on-board adjacent king square is occupied by a mated-side piece",
  smothered: {
    byDistance: smotheredRows.map(({ distance, labelled, matched, missed, recall }) => ({ distance, labelled, matched, missed, recall })),
    totalLabelled,
    totalMatched,
    totalMissed,
    recall: totalMatched / totalLabelled,
    missesByReason: Object.fromEntries(missesByReason),
    missedIds: smotheredRows.flatMap((row) => row.misses).slice(0, 100),
  },
  crossTheme,
  crossThemeExamples: Object.fromEntries(Object.entries(crossThemeExamples).map(([course, matches]) => [course, matches.map(({ id, distance }) => ({ id, distance }))])),
  representativeFixtures: representativeFixtures.map(({ distance, id }) => ({ distance, id })),
  nearMisses: {
    noKnightRecord: idOf(noKnightRecord),
    knightMateNotFullySmothered: knightMateNotFullySmothered.fen(),
    escapeSquare: escapeSquare.fen(),
    capturableKnight: capturableKnight.fen(),
  },
}

console.error(JSON.stringify(report, null, 2))
