import assert from 'node:assert/strict'
import { classifyB1Record } from './lib/verified-lichess-b1-validator.mjs'

const base = {
  sourcePuzzleId: 'fixture', rating: 1500, rawLichessTags: ['promotion'],
  displayedFen: '8/6Pk/8/8/8/8/8/4K3 w - - 0 1', sourceM2Line: ['g7g8q'],
}

const queenMate = classifyB1Record(base)[0]
assert.equal(queenMate.status, 'STRUCTURALLY_VERIFIED')
assert.equal(queenMate.label, 'Promotion')
assert.equal(queenMate.extraction, 'EXTRACTABLE_M1')
assert.equal(queenMate.evidence.promotedPiece, 'Queen')

const underpromotion = classifyB1Record({
  ...base, sourcePuzzleId: 'under', rawLichessTags: ['promotion', 'underPromotion'],
  displayedFen: '8/k1P5/8/1K6/8/8/8/8 w - - 0 1', sourceM2Line: ['c7c8n'],
})[0]
assert.equal(underpromotion.status, 'STRUCTURALLY_VERIFIED')
assert.equal(underpromotion.label, 'Knight Underpromotion')
assert.match(underpromotion.evidence.queenInferiorityReason, /misses the immediate mate|stalemates/)

const nonEp = classifyB1Record({ ...base, sourcePuzzleId: 'ep', rawLichessTags: ['enPassant'], sourceM2Line: ['g7g8q'] })[0]
assert.equal(nonEp.status, 'REJECTED')
assert.match(nonEp.reason, /no learner en-passant capture/)

const ep = classifyB1Record({
  sourcePuzzleId: 'ep-valid', rating: 1800, rawLichessTags: ['enPassant'],
  displayedFen: '7k/8/8/3pP3/8/8/8/K7 w - d6 0 1', sourceM2Line: ['e5d6'],
})[0]
assert.equal(ep.status, 'STRUCTURALLY_VERIFIED')

const requiresEngine = classifyB1Record({
  sourcePuzzleId: 'engine-required', rating: 818, rawLichessTags: ['promotion', 'underPromotion'],
  displayedFen: '7k/8/8/8/8/8/6p1/K7 b - - 0 1', sourceM2Line: ['g2g1n'],
})[0]
assert.equal(requiresEngine.status, 'ENGINE_REQUIRED')
assert.match(requiresEngine.reason, /deterministic engine proof/)
assert.equal(ep.label, 'En Passant')
assert.equal(ep.evidence.enPassantSquare, 'd6')

console.log('Verified Lichess B1 structural validator tests passed.')
