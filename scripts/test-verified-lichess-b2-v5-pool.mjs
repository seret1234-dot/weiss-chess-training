import assert from 'node:assert/strict'
import { selectDiverseCandidates } from './build-verified-lichess-b2-v5-engine-pool.mjs'

const item = (id, family, band) => ({ source: { sourcePuzzleId: id }, exactSymmetryFamilyId: family, features: { ratingBand: band, sourceThemes: 'intermezzo', capturer: 'br', capturedLearnerPiece: 'wp', recaptureSquare: 'd4', boardRegion: 'queen-low', routineRecaptureCount: 1, outcome: 'identity-recapture', sideToMove: 'w', lineLength: 3, responsePattern: 'x', materialConfiguration: 'brxwp' } })
const input = [item('a', 'f1', '900'), item('b', 'f1', '1200'), item('c', 'f2', '1200'), item('d', 'f3', '1500')]
const first = selectDiverseCandidates(input, 4), second = selectDiverseCandidates(input, 4)
assert.deepEqual(first.map((candidate) => candidate.source.sourcePuzzleId), second.map((candidate) => candidate.source.sourcePuzzleId))
assert.equal(new Set(first.map((candidate) => candidate.exactSymmetryFamilyId)).size, first.length)
assert.equal(selectDiverseCandidates(input, 4, new Set(['a'])).some((candidate) => candidate.source.sourcePuzzleId === 'a'), false)
console.log('B2 V5 pool selection tests passed')
