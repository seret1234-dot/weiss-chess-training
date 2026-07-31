import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Chess } from "chess.js"
import { createServer } from "vite"

const root = process.cwd()
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

const activeMateInOneSources = [
  ["Anastasia", "/data/lichess/mate_in_1/anastasia"],
  ["Back Rank", "/data/lichess/mate_in_1/back_rank"],
  ["Arabian", "/data/pattern-mates/arabian/mate-in-1"],
  ["Boden", "/data/pattern-mates/boden/mate-in-1"],
  ["Smothered", "/data/pattern-mates/smothered/mate-in-1"],
  ["Hook", "/data/pattern-mates/hook/mate-in-1"],
  ["Kill Box", "/data/pattern-mates/kill-box/mate-in-1"],
  ["Dovetail", "/data/pattern-mates/dovetail/mate-in-1"],
  ["Double Bishop", "/data/pattern-mates/double-bishop/mate-in-1"],
  ["Mixed", "/data/pattern-mates/mixed/mate-in-1"],
]

function uciParts(uci) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length === 5 ? uci[4] : undefined,
  }
}

function postPreMoveFen(record, validation) {
  if (!record.preMove) return record.fen ?? record.FEN
  const before = record.fen ?? record.FEN
  const preMove = validation.evaluateMateInOneMove(before, uciParts(record.preMove))
  assert.equal(preMove.legal, true, `preMove must be legal for ${record.id ?? record.puzzleId}`)
  // Recreate the exact displayed FEN without relying on stored solution data.
  const game = new Chess(before)
  game.move(uciParts(record.preMove))
  return game.fen()
}

try {
  const validation = await vite.ssrLoadModule("/src/trainers/patternMate/m1MateValidation.ts")

  const reportedFen = "1k3b1r/p2r1pp1/Q3p2p/1p1qP3/1P1P4/6P1/3n1BPP/R1R3K1 w - - 0 23"
  const queenMate = validation.evaluateMateInOneMove(reportedFen, { from: "a6", to: "c8" })
  const rookMate = validation.evaluateMateInOneMove(reportedFen, { from: "c1", to: "c8" })
  const legalNonMate = validation.evaluateMateInOneMove(reportedFen, { from: "a6", to: "a7" })
  assert.deepEqual(validation.getLegalMateInOneMoves(reportedFen).map((move) => move.san).sort(), ["Qc8#", "Rc8#"])
  assert.equal(queenMate.legal, true)
  assert.equal(queenMate.isCheckmate, true, "Qc8# must be accepted for mixed-mate-in-1-FQltB (reported as FQIB)")
  assert.equal(rookMate.legal, true)
  assert.equal(rookMate.isCheckmate, true, "Rc8# must remain accepted")
  assert.equal(legalNonMate.legal, true)
  assert.equal(legalNonMate.isCheckmate, false, "a legal non-mating move remains wrong")
  assert.equal(validation.isPatternMateInOneTrainer("mixed-mate-1"), true)
  assert.equal(validation.isPatternMateInOneTrainer("back-rank-mate-1"), true)
  assert.equal(validation.isPatternMateInOneTrainer("mixed-mate-2"), false)
  assert.equal(validation.acceptsPatternMateMove({
    trainerKey: "mixed-mate-1",
    playedUci: queenMate.uci,
    expectedUci: "c1c8",
    resultingPositionIsCheckmate: queenMate.isCheckmate,
  }), true, "an alternative M1 mate follows the normal correct/progress path and cannot invoke the wrong-move coach")
  assert.equal(validation.acceptsPatternMateMove({
    trainerKey: "mixed-mate-1",
    playedUci: legalNonMate.uci,
    expectedUci: "c1c8",
    resultingPositionIsCheckmate: legalNonMate.isCheckmate,
  }), false, "a legal non-mating M1 move stays on the wrong-move path")
  assert.equal(validation.acceptsPatternMateMove({
    trainerKey: "mixed-mate-2",
    playedUci: queenMate.uci,
    expectedUci: "c1c8",
    resultingPositionIsCheckmate: queenMate.isCheckmate,
  }), false, "M2+ acceptance remains strict")

  console.log("PASS: both Qc8# and Rc8# are accepted as legal mates; a legal non-mate remains wrong")
  console.log("PASS: M1 alternative mates bypass wrong-move coach handling while M2+ remains strict")

  if (process.argv.includes("--audit")) {
    let total = 0
    let multiple = 0
    const byTheme = []
    for (const [theme, dataBasePath] of activeMateInOneSources) {
      const manifest = JSON.parse(await readFile(resolve(root, `public${dataBasePath}/manifest.json`), "utf8"))
      let themeTotal = 0
      let themeMultiple = 0
      for (const file of manifest.files) {
        const chunk = JSON.parse(await readFile(resolve(root, `public${dataBasePath}/${file}`), "utf8"))
        for (const record of (Array.isArray(chunk) ? chunk : chunk.puzzles ?? [])) {
          const fen = postPreMoveFen(record, validation)
          const mateCount = validation.getLegalMateInOneMoves(fen).length
          themeTotal += 1
          if (mateCount > 1) themeMultiple += 1
        }
      }
      total += themeTotal
      multiple += themeMultiple
      byTheme.push({ theme, positions: themeTotal, multipleMateMoves: themeMultiple })
    }

    console.log(JSON.stringify({ totalMateInOnePositions: total, multipleMateInOnePositions: multiple, byTheme }, null, 2))
  }
} finally {
  await vite.close()
}
