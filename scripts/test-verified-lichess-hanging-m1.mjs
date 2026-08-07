import assert from 'node:assert/strict'
import { classifyHangingM1 } from './lib/verified-lichess-hanging-m1.mjs'

const record = (displayedFen, learnerMove) => ({ sourcePuzzleId: 'fixture', displayedFen, sourceM2Line: [learnerMove], rawLichessTags: [] })
const free = classifyHangingM1(record('4k3/8/8/8/8/8/3q4/K2Q4 w - - 0 1', 'd1d2'))
assert.equal(free.status, 'STRUCTURALLY_VERIFIED')
assert.equal(free.evidence.subtype, 'Free Piece')
const defended = classifyHangingM1(record('3rk3/8/8/8/8/8/3q4/K2Q4 w - - 0 1', 'd1d2'))
assert.equal(defended.status, 'ENGINE_REQUIRED')
assert.equal(defended.evidence.subtype, 'Insufficiently Defended')
const mate = classifyHangingM1(record('7k/6Qr/6K1/8/8/8/8/8 w - - 0 1', 'g7h7'))
assert.equal(mate.status, 'REJECTED')
assert.equal(mate.reason, 'mate-primary')
const nonCapture = classifyHangingM1(record('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'e1e2'))
assert.equal(nonCapture.status, 'REJECTED')
assert.equal(nonCapture.reason, 'learner move is not a non-king capture')
console.log('verified Lichess Hanging Piece M1 structural tests passed')
