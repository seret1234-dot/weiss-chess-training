import assert from 'node:assert/strict'
import { exactFamilyIdentifiers } from './lib/verified-lichess-exact-symmetry-family-v3.mjs'

const record = ({ fen = '4k3/8/8/8/4N3/8/8/4K3 w - - 0 1', line = ['e4c5'], key = 'knight-fork', extraction = 'TRUE_M2', evidence = {} } = {}) => ({
  displayedFen: fen,
  sourceM2Line: line,
  canonicalIdentity: `${fen}|${line.join(' ')}`,
  atomic: { extraction, verifiedPrimary: { key, label: key, evidence: { targets: [{ square: 'c5', piece: 'q' }, { square: 'g5', piece: 'r' }], givesCheck: false, ...evidence } } },
})

const original = record()
const same = structuredClone(original)
assert.deepEqual(exactFamilyIdentifiers(original), exactFamilyIdentifiers(same), 'identical records share all ids')

const fileMirror = record({ fen: '3k4/8/8/8/3N4/8/8/3K4 w - - 0 1', line: ['d4f5'], evidence: { targets: [{ square: 'f5', piece: 'q' }, { square: 'b5', piece: 'r' }] } })
assert.equal(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(fileMirror).exactSymmetryFamilyId, 'valid file mirrors share exact symmetry')

const rankColour = record({ fen: '4k3/8/8/4n3/8/8/8/4K3 b - - 0 1', line: ['e5c4'], evidence: { targets: [{ square: 'c4', piece: 'q' }, { square: 'g4', piece: 'r' }] } })
assert.equal(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(rankColour).exactSymmetryFamilyId, 'eligible rank-colour transforms share exact symmetry')

const shifted = record({ fen: '4k3/8/8/4N3/8/8/8/4K3 w - - 0 1', line: ['e5c6'], evidence: { targets: [{ square: 'c6', piece: 'q' }, { square: 'g6', piece: 'r' }] } })
assert.notEqual(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(shifted).exactSymmetryFamilyId, 'shifted geometry remains separate')

const blocker = record({ fen: '4k3/8/8/2p5/4N3/8/8/4K3 w - - 0 1' })
const defender = record({ fen: '4k3/8/4p3/8/4N3/8/8/4K3 w - - 0 1' })
const changedEscape = record({ fen: '4k3/5p2/8/8/4N3/8/8/4K3 w - - 0 1' })
assert.notEqual(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(blocker).exactSymmetryFamilyId, 'blocker changes exact family')
assert.notEqual(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(defender).exactSymmetryFamilyId, 'defender changes exact family')
assert.notEqual(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(changedEscape).exactSymmetryFamilyId, 'king escape context changes exact family')

const edge = record({ fen: 'k7/8/8/8/N7/8/8/4K3 w - - 0 1', line: ['a4b6'], evidence: { targets: [{ square: 'b6', piece: 'q' }, { square: 'd5', piece: 'r' }] } })
assert.notEqual(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(edge).exactSymmetryFamilyId, 'edge context changes exact family')

const castles = record({ fen: '4k3/8/8/8/4N3/8/8/4K2R w K - 0 1' })
const noCastles = record({ fen: '4k3/8/8/8/4N3/8/8/4K2R w - - 0 1' })
const ep = record({ fen: '4k3/8/8/3p4/4N3/8/8/4K3 w - d6 0 1' })
assert.notEqual(exactFamilyIdentifiers(castles).exactSymmetryFamilyId, exactFamilyIdentifiers(noCastles).exactSymmetryFamilyId, 'castling rights change exact family')
assert.notEqual(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(ep).exactSymmetryFamilyId, 'en-passant state changes exact family')

const blackTurn = record({ fen: '4k3/8/8/8/4n3/8/8/4K3 b - - 0 1', line: ['e4c3'], evidence: { targets: [{ square: 'c3', piece: 'q' }, { square: 'g3', piece: 'r' }] } })
assert.notEqual(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(blackTurn).exactSymmetryFamilyId, 'side to move changes exact family')

const checking = record({ fen: '8/3k4/8/8/4N3/8/8/4K3 w - - 0 1', evidence: { givesCheck: true } })
assert.notEqual(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(checking).exactSymmetryFamilyId, 'checking status changes exact family')

const m1 = record({ extraction: 'EXTRACTABLE_M1' })
assert.equal(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(m1).exactSymmetryFamilyId, 'stage does not change exact board signature')
assert.notEqual(exactFamilyIdentifiers(original).pedagogicalFamilyId, exactFamilyIdentifiers(m1).pedagogicalFamilyId, 'M1 and TRUE M2 remain pedagogically separate')

const otherTheme = record({ key: 'bishop-skewer' })
assert.equal(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(otherTheme).exactSymmetryFamilyId, 'cross-theme positions can share exact signature')
assert.notEqual(exactFamilyIdentifiers(original).pedagogicalFamilyId, exactFamilyIdentifiers(otherTheme).pedagogicalFamilyId, 'cross-theme positions remain pedagogically separate')

// These fixtures are 90-degree/diagonal lookalikes. No such transform is
// implemented, so they cannot match the exact full state.
const quarterTurn = record({ fen: '4k3/8/8/4N3/8/8/8/4K3 w - - 0 1', line: ['e5d3'], evidence: { targets: [{ square: 'd3', piece: 'q' }, { square: 'd1', piece: 'r' }] } })
const diagonal = record({ fen: '4k3/8/8/3N4/8/8/8/4K3 w - - 0 1', line: ['d5b4'], evidence: { targets: [{ square: 'b4', piece: 'q' }, { square: 'f4', piece: 'r' }] } })
assert.notEqual(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(quarterTurn).exactSymmetryFamilyId, '90-degree transforms do not match')
assert.notEqual(exactFamilyIdentifiers(original).exactSymmetryFamilyId, exactFamilyIdentifiers(diagonal).exactSymmetryFamilyId, 'diagonal transforms do not match')

console.log('verified Lichess exact-symmetry-family v3 tests passed')
