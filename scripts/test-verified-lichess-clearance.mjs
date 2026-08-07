import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { findClearance } from './lib/verified-lichess-clearance.mjs'
const before=new Chess('q3k3/8/8/8/8/8/B7/R3K3 w - - 0 1'),after=new Chess(before.fen()),move=after.move({from:'a2',to:'b3'})
assert.ok(move);const result=findClearance(before,after,move,'w');assert.equal(result.length,1);assert.equal(result[0].label,'File Clearance');assert.equal(result[0].revealedAttacker,'a1');assert.equal(result[0].benefitingTarget,'a8');console.log('verified Lichess Clearance fixtures passed')
