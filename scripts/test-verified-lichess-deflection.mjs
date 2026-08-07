import assert from 'node:assert/strict'
import { classifyDeflection } from './lib/verified-lichess-deflection.mjs'

const supported = {
  displayedFen: '8/5kp1/p3pb2/8/6Pp/1P4qP/P2R2Q1/7K b - - 3 34',
  sourceM2Line: ['g3e1', 'g2g1', 'e1d2'],
  candidateAtomicThemes: ['Deflection'],
  atomic: { extraction: 'EXTRACTABLE_M1', verifiedPrimary: { label: 'Deflection' } },
}
assert.equal(classifyDeflection(supported).disposition, 'MECHANISM_SUPPORTED_ENGINE_REQUIRED')

const kingEvasion = { ...supported, displayedFen: 'rn1qrk2/ppp3pQ/3p1pP1/3Pp3/2P1P3/8/PP3PP1/R1B1K3 w Q - 3 17', sourceM2Line: ['h7h8', 'f8e7', 'h8g7'] }
assert.notEqual(classifyDeflection(kingEvasion).disposition, 'MECHANISM_SUPPORTED_ENGINE_REQUIRED')

const notDeflection = { ...supported, sourceM2Line: ['g3e1', 'g2f2', 'e1d2'] }
assert.throws(() => classifyDeflection(notDeflection), /Invalid move/)

const incompleteM2 = { ...supported, atomic: { extraction: 'TRUE_M2', verifiedPrimary: { label: 'Deflection' } } }
assert.equal(classifyDeflection(incompleteM2).disposition, 'UNSUPPORTED_TRUE_M2_SEQUENCE')
console.log('verified Lichess Deflection fixtures passed')
