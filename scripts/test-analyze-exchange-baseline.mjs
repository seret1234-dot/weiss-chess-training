import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { Chess } from 'chess.js'

// Run the actual material helper and classification statements; no UI/network.
const require = createRequire(import.meta.url)
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file)
const { captureMaterialLoss } = require('../src/lib/chess/captureMaterial.ts')
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
  'scoreCpFromWhitePerspective', 'scoreCpForReviewSide', 'reviewWinProbability']
const values = { p:100, n:320, b:330, r:500, q:900, k:0 }
const start = source.indexOf('const beforeScore = scoreCpForReviewSide(')
const end = source.indexOf('nextReviewMap[row.ply] = classification;', start)
assert.ok(start > 0 && end > start)
const classificationPath = source.slice(start, end)
const helpers = new Function('Chess','captureMaterialLoss','PIECE_VALUE', ts.transpileModule(
  names.map(name => { assert.ok(declarations[name], name); return declarations[name] }).join('\n') +
  '\nfunction review(beforeFen, row, beforeEval, afterPlayed) { let evalLossCp = 0; const bestUci = beforeEval.bestMove;' +
  classificationPath + '\nreturn { beforeScore, playedScore, evalLossCp, classification }; }' +
  '\nreturn { tacticalPunishCpAfterMove, review };',
  { compilerOptions: { target:ts.ScriptTarget.ES2022 } },
).outputText)(Chess,captureMaterialLoss,values)
const balance = (game,color) => game.board().flat().reduce((sum,p) => sum + (p ? (p.color === color ? 1 : -1)*values[p.type] : 0),0)
let passed = 0
function test(name, fn) { fn(); passed++; console.log('PASS: '+name) }
const pgn = '1. d4 d5 2. c4 dxc4 3. e3 Nc6 4. Bxc4 e5 5. Nf3 Bd6 6. dxe5 Be7 7. O-O Qxd1 8. Rxd1'
const game = new Chess(); game.loadPgn(pgn)
const sans = game.history(), replay = new Chess(), fens = [replay.fen()]
for (const san of sans) { replay.move(san); fens.push(replay.fen()) }

test('capturing move: credit Qxd1 before evaluating Rxd1', () => {
  assert.equal(fens[13], 'r1bqk1nr/ppp1bppp/2n5/4P3/2B5/4PN2/PP3PPP/RNBQ1RK1 b kq - 2 7')
  assert.equal(captureMaterialLoss(fens[14], 'f1d1', 'b', values).loss, 900, 'old local baseline reproduces the bug')
  assert.equal(balance(new Chess(fens[14]),'b') - balance(new Chess(fens[13]),'b'),900)
  assert.equal(balance(new Chess(fens[15]),'b') - balance(new Chess(fens[13]),'b'),0)
  assert.equal(captureMaterialLoss(fens[14], 'f1d1', 'b', values, fens[13]).loss,0)
  assert.equal(helpers.tacticalPunishCpAfterMove(fens[14],'f1d1','b',fens[13]),0)
  // Engine values are controlled inputs here, not claimed as live measurements.
  const result = helpers.review(fens[13],{fen:fens[14],uci:'d8d1',san:'Qxd1',color:'b'},
    {scoreCp:120,bestMove:'c8g4'}, {scoreCp:-120,bestMove:'f1d1'})
  assert.deepEqual(result,{beforeScore:120,playedScore:120,evalLossCp:0,classification:'Excellent'})
  console.log('Classification trace (controlled engine scores): '+JSON.stringify(result))
})

test('move before exchange: O-O remains unpunished; subsequent position stays intact', () => {
  assert.equal(captureMaterialLoss(fens[13],'d8d1','w',values,fens[12]).loss,0)
  assert.equal(helpers.tacticalPunishCpAfterMove(fens[13],'d8d1','w',fens[12]),0)
  const final = new Chess(fens[14]); assert.equal(final.move('Rxd1').from,'f1')
  assert.equal(final.fen(),fens[15]); assert.equal(final.get('d1').type,'r')
  assert.equal(final.get('g1').type,'k'); assert.equal(final.get('h1'),undefined)
})

const flipUci = uci => uci.replace(/[1-8]/g, r => String(9-Number(r)))
const flipFen = fen => {
  const fields = fen.split(' ')
  fields[0] = fields[0].split('/').reverse().join('/').replace(/[a-z]/gi,
    p => p === p.toLowerCase() ? p.toUpperCase() : p.toLowerCase())
  fields[1] = fields[1] === 'w' ? 'b' : 'w'
  return fields.join(' ')
}
const fixtures = [
  ['equal queen trade','3r3k/8/8/3q4/8/8/8/3Q3K w - - 0 1','d1d5','d8d5',0,0],
  ['equal rook trade','3r3k/8/8/3r4/8/8/8/3R3K w - - 0 1','d1d5','d8d5',0,0],
  ['favorable exchange','3r3k/8/8/3q4/8/8/6B1/7K w - - 0 1','g2d5','d8d5',0,0],
  ['losing queen-for-pawn capture','3r3k/8/8/3p4/8/8/8/3Q3K w - - 0 1','d1d5','d8d5',800,450],
  ['losing queen-for-bishop capture','3r3k/8/8/3b4/8/8/8/3Q3K w - - 0 1','d1d5','d8d5',570,450],
  ['losing rook-for-pawn capture','3r3k/8/8/3p4/8/8/8/3R3K w - - 0 1','d1d5','d8d5',400,180],
  ['pinned opponent cannot recapture','R2rk3/8/8/3q4/8/8/8/3Q3K w - - 0 1','d1d5','d8d5',0,0],
  ['genuinely hanging queen','3q3k/8/8/8/3Q4/8/8/7K w - - 0 1','h1h2','d8d4',900,900],
  ['pinned learner cannot save hanging queen','3q3k/8/8/8/3Q4/8/8/r2R1K2 w - - 0 1','f1e1','d8d4',900,900],
]
for (const color of ['w','b']) for (const [name,fen0,move0,reply0,loss,penalty] of fixtures) {
  test(color+': '+name, () => {
    const fen = color === 'w' ? fen0 : flipFen(fen0)
    const move = color === 'w' ? move0 : flipUci(move0)
    const reply = color === 'w' ? reply0 : flipUci(reply0)
    const position = new Chess(fen)
    position.move({from:move.slice(0,2),to:move.slice(2,4)})
    const after = position.fen()
    const actual = captureMaterialLoss(after,reply,color,values,fen)
    assert.equal(actual.loss,loss)
    assert.equal(helpers.tacticalPunishCpAfterMove(after,reply,color,fen),penalty)
    assert.equal(position.fen(),after,'checking captures does not mutate input')
    if (name === 'pinned opponent cannot recapture') {
      assert.ok(!position.moves({verbose:true}).some(m => m.from === reply.slice(0,2) && m.to === reply.slice(2,4)))
    }
  })
}

test('engine-only loss and classification bands are not reduced by a fair trade', () => {
  const result = helpers.review(fens[13],{fen:fens[14],uci:'d8d1',san:'Qxd1',color:'b'},
    {scoreCp:800,bestMove:'c8g4'},{scoreCp:800,bestMove:'f1d1'})
  assert.equal(result.evalLossCp,922)
  assert.equal(result.classification,'Blunder')
})
test('Analyze passes the actual pre-candidate FEN on its classification path', () => {
  assert.match(classificationPath,/tacticalPunishCpAfterMove\(\s*row\.fen,\s*afterPlayed\.bestMove \|\| "",\s*row\.color,\s*beforeFen,\s*\)/)
})
console.log(passed+' exchange-baseline regression groups passed.')

