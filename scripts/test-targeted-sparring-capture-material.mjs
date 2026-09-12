import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { Chess } from 'chess.js'

const require = createRequire(import.meta.url)
require.extensions['.ts'] = (mod, path) => mod._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path)
const { captureMaterialLoss } = require('../src/lib/chess/captureMaterial.ts')
const source = readFileSync(new URL('../src/training/targetedSparring.ts', import.meta.url), 'utf8')
const exports = {}
// Load the real module, but forbid persistence: these are local chess tests.
new Function('require', 'exports', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)((id) => {
  if (id === 'chess.js') return { Chess }
  if (id === '../lib/chess/captureMaterial') return { captureMaterialLoss }
  if (id === '../training/trainerCatalog' || id === './trainerCatalog') return { TRAINER_CATALOG: [] }
  if (id === '../lib/supabase') return { supabase: new Proxy({}, { get() { throw Error('Unexpected database access') } }) }
  throw Error(`Unexpected dependency: ${id}`)
}, exports)
const target = { patternKey: 'hanging-piece', label: 'Hanging Piece', category: 'tactics',
  sourceTrainerKey: 'tactic-hanging-piece-m1', sourceRoute: '/tactics', trainedAt: '2026-09-09T00:00:00Z' }
const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 1200 }
const flipUci = uci => uci.replace(/[1-8]/g, rank => String(9 - Number(rank)))
const flipFen = fen => {
  const fields = fen.split(' ')
  fields[0] = fields[0].split('/').reverse().join('/').replace(/[a-z]/gi,
    piece => piece === piece.toLowerCase() ? piece.toUpperCase() : piece.toLowerCase())
  fields[1] = fields[1] === 'w' ? 'b' : 'w'
  return fields.join(' ')
}
let passed = 0
for (const color of ['white', 'black']) {
  const fixtures = [
    ['hanging queen', '7k/8/8/3q4/8/8/8/3Q3K w - - 0 1', 'd1d5', 900],
    ['equal queen trade', '3r3k/8/8/3q4/8/8/8/3Q3K w - - 0 1', 'd1d5', 0],
    ['favorable unequal trade', '3r3k/8/8/3q4/8/8/6B1/7K w - - 0 1', 'g2d5', 570],
    ['gain below unchanged threshold', '3r3k/8/8/3r4/8/8/6B1/7K w - - 0 1', 'g2d5', 170],
    ['pinned recapture is illegal', 'R2rk3/8/8/3q4/8/8/8/3Q3K w - - 0 1', 'd1d5', 900],
  ]
  for (const [name, whiteFen, whiteUci, gain] of fixtures) {
    const fen = color === 'white' ? whiteFen : flipFen(whiteFen)
    const uci = color === 'white' ? whiteUci : flipUci(whiteUci)
    const game = new Chess(fen), originalFen = game.fen()
    assert.equal(captureMaterialLoss(fen, uci, color === 'white' ? 'b' : 'w', values).loss, gain)
    assert.equal(exports.studentMoveMatchesTransferTarget(fen, uci, target), gain >= 300, `${color}: ${name}`)
    const opportunity = exports.findImmediateTransferOpportunity(game, target, color)
    if (gain < 300) {
      assert.equal(opportunity, null, `${name}: do not offer a false material win`)
    } else {
      assert.equal(opportunity.expectedStudentMove, uci)
      assert.equal(opportunity.score, 520 + gain / 10, 'existing score formula uses actual gain')
      assert.equal(opportunity.description, 'A hanging piece can be won.')
    }
    assert.equal(game.fen(), originalFen, 'candidate search must not mutate its input')
    console.log(`PASS: ${color}: ${name}`); passed++
  }
}
assert.equal(exports.studentMoveMatchesTransferTarget(new Chess().fen(), 'e2e4', target), false)
assert.equal(exports.studentMoveMatchesTransferTarget(new Chess().fen(), 'e2e5', target), false)
assert.equal(exports.findImmediateTransferOpportunity(new Chess(), target, 'black'), null)
// Exercise the surrounding computer candidate-selection path, not just the matcher.
const position = new Chess('7k/8/8/3q4/8/8/7K/3Q4 b - - 0 1')
const candidates = exports.findTargetedComputerCandidates(position, target, 'white', 2)
assert.ok(candidates.length > 0 && candidates.length <= 2)
for (const item of candidates) {
  assert.equal(exports.studentMoveMatchesTransferTarget(item.afterFen, item.opportunity.expectedStudentMove, target), true)
}
assert.ok(candidates.every((item, index) => index === 0 || candidates[index - 1].opportunity.score >= item.opportunity.score))
assert.equal(exports.studentMoveMatchesTransferTarget('7k/P7/8/8/8/8/8/7K w - - 0 1', 'a7a8q',
  { ...target, patternKey: 'promotion' }), true, 'unrelated promotion branch stays available')
console.log(`${passed} White/Black exchange cases plus candidate selection, input immutability, and unrelated promotion checks passed.`)
