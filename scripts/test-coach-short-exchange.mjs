import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { Chess } from 'chess.js'

const require = createRequire(import.meta.url)
require.extensions['.ts'] = (mod, path) => mod._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path)
const { collectBoardFacts } = require('../src/services/coach/boardFacts.ts')
const { explainMistake } = require('../src/services/coach/mistakeExplainer.ts')
const flipUci = uci => uci.replace(/[1-8]/g, rank => String(9 - Number(rank)))
const flipFen = fen => {
  const fields = fen.split(' ')
  fields[0] = fields[0].split('/').reverse().join('/').replace(/[a-z]/gi,
    p => p === p.toLowerCase() ? p.toUpperCase() : p.toLowerCase())
  fields[1] = fields[1] === 'w' ? 'b' : 'w'
  return fields.join(' ')
}
function fixture(fen, moves, color) {
  const fenBefore = color === 'white' ? fen : flipFen(fen)
  const game = new Chess(fenBefore)
  const playedLineSan = moves.map(uci => {
    const move = color === 'white' ? uci : flipUci(uci)
    return game.move({ from: move.slice(0,2), to: move.slice(2,4) }).san
  })
  return { fenBefore, userMoveSan: playedLineSan[0], playedLineSan, userColor: color, source: 'analyze', evalLossCp: 0 }
}
function noFalseLoss(input) {
  const facts = collectBoardFacts(input)
  assert.ok(!facts.tags.includes('lost_queen'), JSON.stringify(facts.tags))
  assert.ok(!facts.tags.includes('hung_piece'), JSON.stringify(facts.tags))
  assert.ok(!facts.tags.includes('bad_trade'))
  assert.ok(!facts.tags.includes('exchange_loss'))
  assert.equal(facts.materialAtRisk, undefined)
  assert.ok(!facts.evidence.tactical.some(item => ['lost_queen','hung_piece','bad_trade','exchange_loss'].includes(item.tag)))
  assert.doesNotMatch(JSON.stringify(explainMistake(input)), /wins the queen|queen is lost|losing the exchange/i)
  return facts
}
let passed = 0
function test(name, run) { run(); passed++; console.log('PASS: '+name) }

test('exact Black Qxd1 Rxd1 two-ply continuation is a verified equal exchange', () => {
  const input = { fenBefore:'r1bqk1nr/ppp1bppp/2n5/4P3/2B5/4PN2/PP3PPP/RNBQ1RK1 b kq - 2 7',
    userMoveSan:'Qxd1',userColor:'black',playedLineSan:['Qxd1','Rxd1'],evalLossCp:0,source:'analyze' }
  const facts = noFalseLoss(input)
  assert.equal(facts.evidence.playedLine.complete,true)
  assert.equal(facts.evidence.playedLine.legalMoves.length,2)
  assert.equal(facts.evidence.playedLine.materialSwingForUser,0)
})

for (const color of ['white','black']) {
  for (const piece of ['q','r']) test(color+': equal '+piece+' trade, two plies', () => {
    const input = fixture('3r3k/8/8/3'+piece+'4/8/8/8/3'+piece.toUpperCase()+'3K w - - 0 1',
      ['d1d5','d8d5'],color)
    const facts = noFalseLoss(input)
    assert.equal(facts.evidence.playedLine.legalMoves.length,2)
    assert.equal(facts.evidence.playedLine.materialSwingForUser,0)
    // Reply-only input is unambiguous only when its SAN differs from the user's
    // move. An isolated "Rxd5" cannot distinguish the two sides of a rook trade.
    if (input.playedLineSan[0] !== input.playedLineSan[1]) {
      noFalseLoss({...input,playedLineSan:input.playedLineSan.slice(1)})
    }
  })
  test(color+': favorable capture/recapture is not material loss', () => {
    const facts = noFalseLoss(fixture('3r3k/8/8/3q4/8/8/6B1/7K w - - 0 1',['g2d5','d8d5'],color))
    assert.ok(facts.evidence.playedLine.materialSwingForUser > 0)
  })
  test(color+': hanging queen without recapture stays tagged', () => {
    const input = fixture('3q3k/8/8/8/3Q4/8/8/7K w - - 0 1',['h1h2','d8d4'],color)
    for (const playedLineSan of [input.playedLineSan, []]) {
      const facts = collectBoardFacts({...input,playedLineSan})
      assert.ok(facts.tags.includes('lost_queen'))
      if (playedLineSan.length) assert.equal(facts.evidence.playedLine.materialSwingForUser,-9)
    }
  })
  test(color+': losing capture stays a bad trade with net material loss', () => {
    const facts = collectBoardFacts(fixture('3r3k/8/8/3b4/8/8/8/3Q3K w - - 0 1',['d1d5','d8d5'],color))
    assert.equal(facts.evidence.playedLine.materialSwingForUser,-6)
    assert.ok(facts.tags.includes('bad_trade'))
    assert.ok(facts.tags.includes('hung_piece'))
    assert.ok(!facts.tags.includes('lost_queen'),'partial compensation is not total queen loss')
  })
  test(color+': pinned illegal recapture cannot establish compensation', () => {
    const input = fixture('3q3k/8/8/8/3Q4/8/8/r2R1K2 w - - 0 1',['f1e1','d8d4'],color)
    const illegal = color === 'white' ? 'Rxd4' : 'Rxd5'
    const final = new Chess(input.fenBefore); for (const san of input.playedLineSan) final.move(san)
    assert.ok(!final.moves().includes(illegal))
    const facts = collectBoardFacts({...input,playedLineSan:[...input.playedLineSan,illegal]})
    assert.equal(facts.evidence.playedLine.complete,false)
    assert.ok(facts.tags.includes('lost_queen'))
  })
  test(color+': unrelated quiet reply cannot hide a hanging queen', () => {
    const input = fixture('3q3k/8/8/8/3Q4/8/8/7K w - - 0 1',['h1h2','h8h7'],color)
    const facts = collectBoardFacts(input)
    assert.equal(facts.evidence.playedLine.complete,true)
    assert.equal(facts.evidence.playedLine.materialSwingForUser,0)
    assert.ok(facts.tags.includes('lost_queen'),'compensation must match the capture being evaluated')
  })
}
console.log(passed+' coach short-continuation regression groups passed.')
