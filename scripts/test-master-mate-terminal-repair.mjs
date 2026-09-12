import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Chess } from 'chess.js'

const id = 'mtc2_b097717dd02f8a910e33c1fce78db589b7d421772e734477723ddf130144c4eb'
const root = process.cwd()
const corpus = join(root, 'public/data/master-puzzles/v1')
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const index = await readJson(join(corpus, 'indexes/mates-distance-1.json'))
const ref = index.refs.find((item) => item.id === id)
assert.deepEqual(ref, { id, chunk: 529 }, 'Master Mate membership must retain its canonical reference')
const chunk = await readJson(join(corpus, 'puzzles/chunk-00529.json'))
const puzzle = chunk.puzzles.find((item) => item.id === id)
assert.ok(puzzle, 'Missing canonical Master Mate payload')
assert.equal(puzzle.fen, '8/3B4/8/5p2/4pk1p/6RP/6PK/2r5 b - - 0 57')
assert.equal(puzzle.learnerSide, 'b')
assert.deepEqual(puzzle.solution, [{ offset: 0, side: 'learner', uci: 'h4g3', san: 'hxg3#' }])
assert.equal(puzzle.learningDistance, 1)
assert.equal(puzzle.provenance?.sourcePly, 113)
assert.equal(puzzle.provenance?.historicalMoveUci, 'h4g3')
assert.equal(puzzle.provenance?.historicalMoveSan, 'hxg3#')
assert.notEqual(puzzle.provenance?.correctedRoot, true, 'Nonterminal earlier-root replacement must not overwrite a Master Mate')
const game = new Chess(puzzle.fen)
for (const step of puzzle.solution) game.move({ from: step.uci.slice(0, 2), to: step.uci.slice(2, 4), promotion: step.uci[4] })
assert.equal(game.isCheckmate(), true, 'Restored Master Mate must replay to checkmate')

const materializer = await readFile(join(root, 'scripts/master-tactics/build-final-master-puzzles-corpus.mjs'), 'utf8')
assert.match(materializer, /mateIds\.has\(puzzle\.id\) \? null : repairs\.get\(puzzle\.id\)/, 'Final materializer must protect Master-Mate source contracts from earlier-root replacements')
console.log(JSON.stringify({ id, membership: 'mates-distance-1', terminalCheckmate: true, materializerGuard: true }))
