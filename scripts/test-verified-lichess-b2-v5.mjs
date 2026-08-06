import assert from 'node:assert/strict'
import { classifyB2V5 } from './classify-verified-lichess-b2-v5.mjs'
import { verifyB2Reference } from './lib/verified-lichess-b2-reference.mjs'

const agree = (source, key, mateSupersession) => {
  const production = classifyB2V5(source), reference = verifyB2Reference(source)
  assert.equal(production.length, 1)
  assert.equal(reference.length, 1)
  assert.equal(production[0].status, 'MECHANISM_SUPPORTED_ENGINE_REQUIRED')
  assert.equal(reference[0].supported, true)
  assert.equal(production[0].key, key)
  assert.equal(reference[0].subtype, key)
  assert.equal(production[0].extraction, 'EXTRACTABLE_M1')
  assert.equal(reference[0].stage, 'EXTRACTABLE_M1')
  assert.equal(production[0].evidence.mateSupersession, mateSupersession)
}

const checkRecapture = { sourceFen: '3qr1k1/p4p1p/6p1/3pQ3/8/1P3P2/P5PP/3R2K1 w - - 2 26', preMove: 'e5d5', sourceM2Line: ['e8e1', 'd1e1', 'd8d5'] }
const checkMate = { sourceFen: 'r4r2/2q1NN2/4bQpk/2n4p/pp5P/8/1PP2PP1/2KR3R b - - 0 28', preMove: 'e6f7', sourceM2Line: ['e7f5', 'h6h7', 'f6g7'] }
const captureMate = { sourceFen: 'r4rk1/3n1p2/p3p1p1/2qbP2p/1p2B2Q/2N1R2R/PPP3PP/7K b - - 1 22', preMove: 'b4c3', sourceM2Line: ['h4h5', 'g6h5', 'e3g3', 'g8h8', 'h3h5'] }

agree(checkRecapture, 'zwischencheck', false)
agree(checkMate, 'zwischencheck', true)
agree(captureMate, 'zwischenzug', true)
assert.equal(classifyB2V5(captureMate).length, 1, 'later continuation must not become a second focused lesson')
assert.equal(verifyB2Reference(captureMate).length, 1, 'reference must also use only the displayed learner decision')
const weak = classifyB2V5({ ...checkRecapture, sourceM2Line: ['e8e1', 'd1e1'] })
assert.equal(weak[0].status, 'WEAK_TAG_ONLY')
console.log('B2 V5 production/reference fixtures passed')
