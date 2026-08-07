import assert from 'node:assert/strict'
import { classifyCaptureDecoy } from './lib/verified-lichess-decoy-attraction.mjs'

// A tag alone is never enough: an ordinary exchange with no attracted piece on
// the later capture square is rejected.
const tagOnly = {
  displayedFen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
  sourceM2Line: ['e2e4', 'e8e7', 'e4e5'],
  candidateAtomicThemes: ['Decoy / Attraction'],
  atomic: { extraction: 'EXTRACTABLE_M1', verifiedPrimary: { label: 'Decoy / Attraction' } },
}
assert.notEqual(classifyCaptureDecoy(tagOnly).disposition, 'MECHANISM_SUPPORTED_ENGINE_REQUIRED')
assert.equal(classifyCaptureDecoy({ ...tagOnly, atomic: { extraction: 'TRUE_M2', verifiedPrimary: { label: 'Decoy / Attraction' } } }).disposition, 'UNSUPPORTED_TRUE_M2_SEQUENCE')
console.log('verified Lichess Decoy/Attraction fail-closed fixtures passed')
