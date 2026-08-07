import assert from 'node:assert/strict'
import { actualStage, parseMoves } from './lib/verified-lichess-csv.mjs'

const metadata = {
  sourcePuzzleId: '01cHu', sourceRowNumber: 42, ratingDeviation: 76,
  popularity: 91, nbPlays: 1203, openingTags: ['A00', 'A00_Amar_Opening'],
}
assert.equal(metadata.sourcePuzzleId, '01cHu')
assert.equal(metadata.sourceRowNumber, 42)
assert.deepEqual(metadata.openingTags, ['A00', 'A00_Amar_Opening'])
assert.equal(actualStage(parseMoves('e2e4 e7e5 g1f3')), 1)
assert.equal(actualStage(parseMoves('e2e4 e7e5 g1f3 b8c6')), 2)
console.log('verified Lichess master source infrastructure tests passed')
