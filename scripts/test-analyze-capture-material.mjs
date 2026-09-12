import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { Chess } from 'chess.js'

// Execute the actual TS helpers without mounting React or calling remote services.
const require = createRequire(import.meta.url)
require.extensions['.ts'] = (mod, path) => mod._compile(ts.transpileModule(
  readFileSync(path, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
).outputText, path)
const { captureMaterialLoss } = require('../src/lib/chess/captureMaterial.ts')
const { collectBoardFacts } = require('../src/services/coach/boardFacts.ts')
const { explainMistake } = require('../src/services/coach/mistakeExplainer.ts')
const source = readFileSync(new URL('../src/pages/analyze/AnalyzeBoardPage.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('Analyze.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const declarations = {}
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) declarations[node.name.text] = node.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
const names = ['tacticalPunishCpAfterMove', 'materialBalanceForSide', 'isInspiredCandidate',
  'classifyReviewMove', 'isTerminalReviewPosition', 'rawEngineScoreCp',
  'scoreCpFromWhitePerspective', 'scoreCpForReviewSide', 'validateUciLine']
const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }
const helpers = new Function('Chess', 'captureMaterialLoss', 'PIECE_VALUE', ts.transpileModule(
  names.map(name => { assert.ok(declarations[name], name); return declarations[name] }).join('\n') +
    `\nreturn { ${names.join(',')} };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText)(Chess, captureMaterialLoss, values)

let checks = 0
function test(name, run) { run(); checks++; console.log(`PASS: ${name}`) }
const pgn = '1. d4 d5 2. c4 dxc4 3. e3 Nc6 4. Bxc4 e5 5. Nf3 Bd6 6. dxe5 Be7 7. O-O'
const parsed = new Chess(); parsed.loadPgn(pgn)
const replay = new Chess(), rows = []
for (const san of parsed.history()) { replay.move(san); rows.push(replay.fen()) }
const before = rows[11], after = rows[12]
const input = { fenBefore: before, userMoveSan: 'O-O', userMoveUci: 'e1g1',
  bestMoveSan: 'Qxd8+', playedLineSan: ['O-O', 'Qxd1', 'Rxd1'], userColor: 'white', source: 'analyze', evalLossCp: 0 }
const balance = game => game.board().flat().reduce((n, p) => n + (p ? (p.color === 'w' ? 1 : -1) * values[p.type] : 0), 0)

test('exact PGN keeps the correct castling position and rights', () => {
  assert.equal(before, 'r1bqk1nr/ppp1bppp/2n5/4P3/2B5/4PN2/PP3PPP/RNBQK2R w KQkq - 1 7')
  assert.equal(after, 'r1bqk1nr/ppp1bppp/2n5/4P3/2B5/4PN2/PP3PPP/RNBQ1RK1 b kq - 2 7')
  assert.equal(replay.get('g1').type, 'k'); assert.equal(replay.get('f1').type, 'r')
  assert.equal(replay.get('h1'), undefined)
})
test('Qxd1 Rxd1 is legal, material-neutral, and subsequent analysis uses the correct FEN', () => {
  const game = new Chess(after), initial = balance(game)
  assert.equal(game.move('Qxd1').san, 'Qxd1'); assert.equal(game.move('Rxd1').from, 'f1')
  assert.equal(balance(game) - initial, 0)
  assert.equal(game.fen(), 'r1b1k1nr/ppp1bppp/2n5/4P3/2B5/4PN2/PP3PPP/RNBR2K1 b kq - 0 8')
  const extended = new Chess(); extended.loadPgn(`${pgn} Qxd1 8. Rxd1 Nh6 9. Nc3`)
  game.move('Nh6'); game.move('Nc3'); assert.equal(game.fen(), extended.fen())
  assert.deepEqual(helpers.validateUciLine(before, ['e1g1','d8d1','f1d1','g8h6','b1c3']),
    { san: ['O-O','Qxd1','Rxd1','Nh6','Nc3'], complete: true })
})
test('no artificial queen-loss penalty; review thresholds and evaluation signs unchanged', () => {
  assert.equal(helpers.tacticalPunishCpAfterMove(after, 'd8d1', 'w'), 0)
  const args = { playedUci: 'e1g1', bestUci: 'd1d8', beforeFen: before, afterFen: after, moverColor: 'w', san: 'O-O' }
  for (const [loss, label] of [[0,'Excellent'],[20,'Excellent'],[21,'Good'],[50,'Good'],[51,'Inaccuracy'],[100,'Inaccuracy'],[101,'Mistake'],[250,'Mistake'],[251,'Blunder']]) {
    assert.equal(helpers.classifyReviewMove({ ...args, evalLossCp: loss }), label)
  }
  assert.equal(helpers.scoreCpForReviewSide({ scoreCp: 100 }, before, 'w'), 100)
  assert.equal(helpers.scoreCpForReviewSide({ scoreCp: -100 }, after, 'w'), 100)
  assert.match(source, /evaluateForReview\(row\.fen, false, row\.ply\)/)
  assert.match(source, /position=\{\(isSetupPositionOpen \? setupBoard : game\.fen\(\)\)/)
})
test('coach honors zero material swing, with or without supplied recapture', () => {
  for (const playedLineSan of [input.playedLineSan, ['O-O','Qxd1'], []]) {
    const facts = collectBoardFacts({ ...input, playedLineSan })
    assert.ok(!facts.tags.includes('lost_queen')); assert.ok(!facts.tags.includes('hung_piece'))
    assert.doesNotMatch(JSON.stringify(explainMistake({ ...input, playedLineSan })), /wins the queen|queen is lost/i)
  }
  assert.equal(collectBoardFacts(input).evidence.playedLine.materialSwingForUser, 0)
})

for (const piece of ['q','r']) for (const defended of [true,false]) {
  test(`${piece === 'q' ? 'queen' : 'rook'} ${defended ? 'exchange' : 'genuinely hanging'} outside castling`, () => {
    const fen = `3${piece}3k/8/8/8/3${piece.toUpperCase()}4/8/8/${defended ? '3R3K' : '7K'} w - - 0 1`
    const game = new Chess(fen); game.move('Kh2')
    const loss = captureMaterialLoss(game.fen(), 'd8d4', 'w', values)
    assert.equal(loss.loss, defended ? 0 : values[piece])
    assert.equal(helpers.tacticalPunishCpAfterMove(game.fen(), 'd8d4', 'w'), defended ? 0 : piece === 'q' ? 900 : 450)
    const facts = collectBoardFacts({ fenBefore: fen, userMoveSan: 'Kh2', userColor: 'white',
      playedLineSan: ['Kh2',`${piece.toUpperCase()}xd4`, ...(defended ? ['Rxd4'] : [])] })
    assert.equal(facts.tags.includes(piece === 'q' ? 'lost_queen' : 'hung_piece'), !defended)
  })
}
test('a pinned rook cannot legally recapture: real queen loss remains 900', () => {
  const game = new Chess('3q3k/8/8/8/3Q4/8/8/r2R1K2 w - - 0 1'); game.move('Ke1')
  assert.equal(helpers.tacticalPunishCpAfterMove(game.fen(), 'd8d4', 'w'), 900)
  game.move('Qxd4'); assert.ok(!game.moves().includes('Rxd4'))
})
test('unequal exchange retains the actual loss rather than forgiving all recaptures', () => {
  const fen = '7k/6b1/8/8/3Q4/8/7K/3R4 b - - 0 1'
  assert.equal(captureMaterialLoss(fen, 'g7d4', 'w', values).loss, 570)
  assert.equal(helpers.tacticalPunishCpAfterMove(fen, 'g7d4', 'w'), 450)
})
test('the same exchange rule applies when Black is the victim', () => {
  const fen = '3r3k/8/8/3q4/8/8/7K/3Q4 w - - 0 1'
  assert.equal(captureMaterialLoss(fen, 'd1d5', 'b', values).loss, 0)
  assert.equal(helpers.tacticalPunishCpAfterMove(fen, 'd1d5', 'b'), 0)
  const hanging = fen.replace('3r3k', '7k')
  assert.equal(helpers.tacticalPunishCpAfterMove(hanging, 'd1d5', 'b'), 900)
})
test('a capture-promotion uses actual resulting material, including the recapture', () => {
  const fen = '7k/8/8/8/8/8/1p5K/R2R4 b - - 0 1'
  // ...bxa1=Q Rxa1 trades a pawn for a rook; it is not a free rook loss.
  assert.equal(captureMaterialLoss(fen, 'b2a1q', 'w', values).loss, 400)
})
test('complete zero-swing continuation overrides a speculative queen-win claim', () => {
  const facts = collectBoardFacts({ fenBefore: 'q2q3k/8/8/8/3Q4/8/8/R6K w - - 0 1',
    userMoveSan: 'Kh2', userColor: 'white', playedLineSan: ['Kh2','Qxd4','Rxa8+'] })
  assert.equal(facts.evidence.playedLine.complete, true)
  assert.equal(facts.evidence.playedLine.materialSwingForUser, 0)
  assert.ok(!facts.tags.includes('lost_queen')); assert.ok(!facts.tags.includes('hung_piece'))
})
test('invalid continuation cannot exonerate a genuinely hanging queen', () => {
  const facts = collectBoardFacts({ fenBefore: '3q3k/8/8/8/3Q4/8/8/7K w - - 0 1',
    userMoveSan: 'Kh2', userColor: 'white', playedLineSan: ['Kh2','Qxd4','Rxd4'] })
  assert.equal(facts.evidence.playedLine.complete, false); assert.ok(facts.tags.includes('lost_queen'))
})
test('invalid/noncapture/wrong-side input produces no fabricated penalty', () => {
  for (const uci of ['garbage','d8d3','d8e8']) assert.equal(captureMaterialLoss(after, uci, 'w', values).loss, 0)
  assert.equal(captureMaterialLoss(after, 'd8d1', 'b', values).loss, 0)
})
console.log(`${checks} capture/material regression groups passed (no engine/network calls).`)
