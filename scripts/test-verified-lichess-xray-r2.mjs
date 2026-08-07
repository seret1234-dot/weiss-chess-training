import assert from 'node:assert/strict'
import { classifyXrayAttackR2, classifyXrayDefenseR2 } from './lib/verified-lichess-xray-r2.mjs'

const source = (overrides = {}) => ({ sourcePuzzleId: 'xray-r2-fixture', sourceFen: '4k3/8/8/8/8/8/4K3/3R4 w - - 0 1', displayedFen: '4k3/8/8/8/8/8/4K3/3R4 w - - 0 1', preMove: 'd1d2', sourceM2Line: ['e8f8'], sourceStage: 1, rating: 1500, rawLichessTags: ['xRayAttack'], ...overrides })
assert.equal(classifyXrayAttackR2(source()).status, 'REJECTED')
assert.equal(classifyXrayDefenseR2(source()).status, 'REJECTED')
assert.equal(classifyXrayAttackR2(source({ sourceStage: 3 })).status, 'WEAK_TAG_ONLY')
console.log('verified Lichess X-Ray R2 deterministic guards passed')
