import assert from 'node:assert/strict'
import { verifyUnpaidPending, checkoutHistoryProof } from '../server/affiliate-eligibility.mjs'
import { createCheckout } from '../server/affiliate-core.mjs'

globalThis.fetch = async () => { throw new Error('Network forbidden in eligibility fixtures') }
const user = '70000000-0000-4000-8000-000000000001'
const now = () => Date.parse('2026-09-08T12:00:00Z')
const plans = new Map([['P-NORMAL-M', 'monthly'], ['P-NORMAL-Y', 'yearly'], ['P-AFFILIATE', 'monthly']])
const details = { id: 'I-PENDING', custom_id: `${user}|monthly`, plan_id: 'P-NORMAL-M', status: 'APPROVAL_PENDING', create_time: '2026-09-08T10:00:00Z' }
const empty = { transactions: [], total_items: 0, total_pages: 0 }
const provider = (d = details, transactions = empty) => async (path, options) => {
  assert.equal(options, undefined, 'Eligibility may only GET provider evidence')
  return path.includes('/transactions?') ? transactions : d
}
const verify = (d, tx) => verifyUnpaidPending('I-PENDING', user, plans, provider(d, tx), now)
assert.equal((await verify()).eligible, true, 'A: fresh exact pre-approval details, subject to local guard')
const pending404 = await verifyUnpaidPending(details.id, user, plans, async path => {
  if (path.includes('/transactions')) throw Object.assign(Error('RESOURCE_NOT_FOUND'), { status: 404 })
  return details
}, now)
assert.equal(pending404.eligible, true, 'B: unavailable history is not required for exact APPROVAL_PENDING')
assert.equal(pending404.transaction_count, null, 'Never infer zero provider transactions')
assert.equal(pending404.transaction_history_status, 'NOT_APPLICABLE_APPROVAL_PENDING')
assert.equal((await verify({ ...details, plan_id: 'P-AFFILIATE' })).eligible, true, 'Affiliate pending equally eligible')
assert.equal((await verify({ ...details, plan_id: 'P-NORMAL-Y', custom_id: `${user}|yearly` })).eligible, true, 'Ordinary yearly pending eligible')
assert.equal((await verifyUnpaidPending(details.id, user, plans, async () => { throw Error('unavailable') }, now)).eligible, false, 'B: unavailable fails closed')
for (const status of ['APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED', undefined, 'UNKNOWN']) {
  assert.equal((await verify({ ...details, status, billing_info: { last_payment: { amount: { value: '9.00' } } } })).eligible, false, `${status}: paid C/D/E`)
  assert.equal((await verify({ ...details, status })).eligible, false, `${status}: status alone not proof unpaid`)
}
for (const change of [
  { id: 'I-OTHER' }, { custom_id: 'another|monthly' }, { custom_id: `${user}|yearly` }, { plan_id: 'P-UNKNOWN' },
  { create_time: undefined }, { create_time: '2020-01-01T00:00:00Z' }, { create_time: '2027-01-01T00:00:00Z' },
  { billing_info: { last_payment: {} } }, { billing_info: { cycle_executions: [{ cycles_completed: 1 }] } },
  { billing_info: { cycle_executions: [{}] } },
]) assert.equal((await verify({ ...details, ...change })).eligible, false, 'G: incomplete/contradictory evidence')
let reads = 0
assert.equal((await verifyUnpaidPending(details.id, user, plans, async path => path.includes('/transactions?') ? empty : ++reads === 1 ? details : { ...details, status: 'ACTIVE' }, now)).eligible, false, 'Provider state changed between reads')
let detailOnlyReads = 0
const old = { ...details, create_time: '2026-07-01T00:00:00Z' }
assert.equal((await verifyUnpaidPending(details.id, user, plans, async path => {
  assert.equal(path, `/v1/billing/subscriptions/${details.id}`, 'Live verification uses detail GET only')
  detailOnlyReads++; return old
}, now)).eligible, true)
assert.equal(detailOnlyReads, 2, 'Re-read exact provider state before accepting fresh proof')
let clock = now()
assert.equal((await verifyUnpaidPending(details.id, user, plans, async () => {
  clock += 31_000; return details
}, () => clock)).reason, 'STALE_PROVIDER_PROOF', 'H: slow/stale reads cannot mint proof')

const history = { fingerprint: 'fixture', ids: [], blocked: false }
const db = { rpc: async (name, args) => { assert.equal(name, 'affiliate_eligibility_history'); assert.equal(args.p_actor, user); return { data: history } } }
assert.deepEqual((await checkoutHistoryProof(db, user, plans, async () => { throw Error('H needs no provider') }, now)).ids, [], 'H: no history')
history.ids = ['I-FIRST', 'I-SECOND']
const multi = async path => path.includes('/transactions?') ? empty : { ...details, id: path.split('/').at(-1) }
assert.deepEqual((await checkoutHistoryProof(db, user, plans, multi, now)).ids, history.ids, 'Every abandoned pending ID verified')
assert.notDeepEqual((await checkoutHistoryProof(db, user, plans, async path => path.includes('I-SECOND') ? { ...details, status: 'ACTIVE' } : multi(path), now)).ids, history.ids)
history.blocked = true
assert.deepEqual((await checkoutHistoryProof(db, user, plans, async () => { throw Error('Paid ledger skips provider') }, now)).ids, [])
for (const reason of ['successful payment', 'Premium entitlement', 'consumed discount', 'ambiguous history']) {
  assert.deepEqual((await checkoutHistoryProof(db, user, plans, async () => { assert.fail(`${reason} must block before provider`); }, now)).ids, [], `C: ${reason} blocks`)
}
await assert.rejects(checkoutHistoryProof({ rpc: async () => ({ error: {} }) }, user, plans, multi, now), /history unavailable/)

// The public request cannot supply the privileged RPC's proof/identity/discount.
process.env.PAYPAL_MODE = 'sandbox'
process.env.AFFILIATE_PROGRAM_ENABLED = 'true'
delete process.env.PAYPAL_API_BASE_URL
process.env.AFFILIATE_CHECKOUT_ORIGIN = 'http://127.0.0.1:4250'
for (const [key, id] of Object.entries({ MONTHLY_STANDARD: 'P-MS', MONTHLY_TAXED: 'P-MT', YEARLY_STANDARD: 'P-YS', YEARLY_TAXED: 'P-YT' })) process.env[`PAYPAL_PLAN_${key}`] = id
const { configureAffiliateTaxFixture } = await import('./affiliate-tax-test-fixture.mjs')
configureAffiliateTaxFixture()
const publicDb = {
  from() { const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => ({ data: null }) }; return chain },
  async rpc(name, args) {
    if (name === 'affiliate_eligibility_history') return { data: { ids: [], fingerprint: 'server-only', blocked: false } }
    assert.equal(args.p_actor, user)
    assert.equal(args.p_data.history_proof.fingerprint, 'server-only')
    assert.notEqual(args.p_data.history_proof.checked_at, 'forged')
    assert.equal(args.p_data.normal_plan, 'P-MS')
    assert.equal(args.p_data.discount_bps, undefined)
    if(name==='affiliate_checkout_selection') return {data:{eligible:false,can_create:true,plan_id:'P-MS',rate_bps:0,attribution_present:false,affiliate_code:null,reason:'NO_REFERRAL'}}
    return { data: { subscription_id: 'I-FIXTURE', discount_bps: 0, plan_id:'P-MS' } }
  },
}
await createCheckout(publicDb, { id: user }, { headers: {}, body: { period: 'monthly', user_id: 'other', discount_bps: 1000, history_proof: { fingerprint: 'forged', checked_at: 'forged' } } }, async (path,options) => {
  assert.equal(options,undefined,'No provider creation in this fixture');assert.equal(path,'/v1/billing/plans/P-MS')
  return {id:'P-MS',status:'ACTIVE',billing_cycles:[{pricing_scheme:{fixed_price:{currency_code:'USD',value:'8.99'}}}]}
})
console.log('PASS A–H fresh APPROVAL_PENDING-only exception; detail GET/recheck; no invented transaction count; local paid/entitled/consumed/unknown guard; identities; other states; outage; stale/change; no network or writes')
