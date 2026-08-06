import assert from 'node:assert/strict'
import { replayTrace } from './lib/verified-lichess-replay-trace.mjs'
let t = replayTrace('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', ['e2e4'], 0); assert.equal(t[0].movingPieceId, t[0].afterIds.get('e4')); assert.equal(t[0].givesCheck, false)
t = replayTrace('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', ['e5d6'], 0); assert.equal(t[0].capturedSquare, 'd5'); assert.ok(t[0].capturedPieceId)
t = replayTrace('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1g1'], 0); assert.ok(t[0].afterIds.get('g1')); assert.ok(t[0].afterIds.get('f1'))
t = replayTrace('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', ['a7a8q'], 0); assert.equal(t[0].movingPieceId, t[0].afterIds.get('a8')); assert.equal(t[0].promotionPiece, 'q')
console.log('replay trace tests passed')
