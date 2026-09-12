import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Chess } from "chess.js"
import { detectAllMateThemes } from "./lib/detect-mate-themes.mjs"
import { replayPuzzleToTerminal } from "./lib/detect-smothered-mate.mjs"

const root = process.cwd()
const report = JSON.parse(await readFile(join(root, "reports/master-mates/v1/legacy-m5-authoritative-recovery.json"), "utf8"))
assert.equal(report.totals.recovered, 38)
assert.deepEqual(report.totals.byTheme, { "back-rank": 33, arabian: 5 })
assert.match(report.rootCause, /full authoritative tail/)
const ids = new Set()
for (const item of report.recovered) {
  assert.ok(!ids.has(item.id), `${item.id}: no duplicate recovery ID`); ids.add(item.id)
  assert.ok(item.rawMoves.length >= 12 && item.rawMoves.length % 2 === 0, `${item.id}: raw Lichess Moves retains pre-move plus the complete odd solution tail`)
  assert.ok(item.solutionLine.length >= 11 && item.solutionLine.length % 2 === 1, `${item.id}: complete Mate-in-5 solution tail retained`)
  const board = new Chess(item.rawFenBeforePreMove)
  assert.ok(board.move({ from: item.preMove.slice(0, 2), to: item.preMove.slice(2, 4), promotion: item.preMove[4] }), `${item.id}: authoritative pre-move is legal`)
  assert.equal(board.fen().split(" ").slice(0, 4).join(" "), item.authoritativeFenAfterPreMove.split(" ").slice(0, 4).join(" "), `${item.id}: raw pre-move handling matches Lichess puzzle FEN`)
  for (const uci of item.solutionLine) assert.ok(board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }), `${item.id}: authoritative solution is legal`)
  assert.ok(board.isCheckmate(), `${item.id}: complete authoritative line checkmates`)
  const payload = JSON.parse(await readFile(join(root, item.sourceFile), "utf8")); const record = (payload.puzzles ?? payload).find((row) => (row.lichessId ?? row.id) === item.id)
  assert.ok(record, `${item.id}: source record retained`)
  const replay = replayPuzzleToTerminal(record)
  assert.ok(replay.game.isCheckmate(), `${item.id}: regenerated Weiss record checkmates`)
  assert.ok(detectAllMateThemes(record)[item.theme].matched, `${item.id}: source-faithful detector recovers expected theme`)
}
for (const file of ["generate_back_rank_mate_in_5.cjs", "generate_arabian_mate_in_5.cjs"]) {
  const source = await readFile(join(root, "scripts", file), "utf8")
  assert.match(source, /minimumSolutionMoveCount = mateDistance \* 2 \+ 1/)
  assert.match(source, /solutionLine: puzzle\.moves\.slice\(1\)/)
}
console.log(`legacy M5 repair verified: ${ids.size}/38 authoritative rows`)
