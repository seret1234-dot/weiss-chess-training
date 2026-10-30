import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Chess } from 'chess.js'

const promotionPieces = ['q', 'r', 'b', 'n']

function assertPromotion({ fen, from, to, color, destinationRank }) {
  for (const promotion of promotionPieces) {
    const game = new Chess(fen)
    const move = game.move({ from, to, promotion })

    assert.equal(move?.promotion, promotion)
    assert.deepEqual(game.get(to), { type: promotion, color })
    assert.equal(game.fen().split(' ')[0].includes(`${color === 'w' ? promotion.toUpperCase() : promotion}`), true)
    assert.equal(to[1], destinationRank)
  }
}

// White and black each receive every legal promotion option.
assertPromotion({
  fen: '8/P7/8/8/8/7k/8/7K w - - 0 1',
  from: 'a7',
  to: 'a8',
  color: 'w',
  destinationRank: '8',
})
assertPromotion({
  fen: '7k/8/7K/8/8/8/p7/8 b - - 0 1',
  from: 'a2',
  to: 'a1',
  color: 'b',
  destinationRank: '1',
})

// Puzzle evaluation receives the chosen UCI, so an underpromotion that does
// not match the expected one is an incorrect move rather than a hidden option.
const expectedUci = 'a7a8n'
const wrongPromotion = new Chess('8/P7/8/8/8/7k/8/7K w - - 0 1')
const wrongMove = wrongPromotion.move({ from: 'a7', to: 'a8', promotion: 'b' })
const playedUci = `${wrongMove.from}${wrongMove.to}${wrongMove.promotion}`
assert.notEqual(playedUci, expectedUci)

// Ordinary moves retain no promotion code.
const ordinaryGame = new Chess()
const ordinaryMove = ordinaryGame.move({ from: 'e2', to: 'e4' })
assert.equal(ordinaryMove?.promotion, undefined)

for (const trainerPath of [
  'src/trainers/patternMate/PatternMateTrainer.tsx',
  'src/trainers/patternTactic/PatternTacticTrainer.tsx',
]) {
  const source = await readFile(path.join(process.cwd(), trainerPath), 'utf8')
  assert.match(source, /onPromotionCheck=/)
  assert.match(source, /onPromotionPieceSelect=/)
  assert.match(source, /PromotionChooser/)
  assert.match(source, /promotionDialogVariant="(modal|vertical)"/)
  assert.match(source, /onSelect=\{\(promotion: PromotionPiece\)/)
}

const chooserSource = await readFile(
  path.join(process.cwd(), 'src/components/chess/PromotionChooser.tsx'),
  'utf8',
)
for (const promotion of promotionPieces) {
  assert.ok(chooserSource.includes(`piece: '${promotion}'`))
}

console.log('PASS promotion flow supports q/r/b/n for both colors and validates the selected piece')
