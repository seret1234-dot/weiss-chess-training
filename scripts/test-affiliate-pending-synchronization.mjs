import assert from 'node:assert/strict'
import { synchronizePayPalSubscription } from '../server/paypal-subscription-core.mjs'
const user = '72000000-0000-4000-8000-000000000001'
process.env.AFFILIATE_PROGRAM_ENABLED = 'false'
process.env.PAYPAL_MODE = 'sandbox'
delete process.env.PAYPAL_API_BASE_URL
process.env.PAYPAL_CLIENT_ID = 'fixture-not-a-credential'
process.env.PAYPAL_SECRET = 'fixture-not-a-credential'
for (const [key, value] of Object.entries({ MONTHLY_STANDARD: 'P-MS', MONTHLY_TAXED: 'P-MT', YEARLY_STANDARD: 'P-YS', YEARLY_TAXED: 'P-YT' })) process.env[`PAYPAL_PLAN_${key}`] = value
let current = null, incoming, observations = [], writes = 0, requests = []
globalThis.fetch = async (url, options = {}) => {
  requests.push({ url, method: options.method || 'GET' })
  if (url === 'https://api-m.sandbox.paypal.com/v1/oauth2/token') return Response.json({ access_token: 'fixture-only' })
  assert.equal(options.method, undefined, 'No subscription creation/approval/payment')
  assert.equal(url, `https://api-m.sandbox.paypal.com/v1/billing/subscriptions/${incoming.id}`)
  return Response.json(incoming)
}
const db = {
  from(table) {
    assert.equal(table, 'subscriptions', 'No affiliate accounting or attribution writes while OFF')
    let row
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: current }),
      upsert(data, options) { assert.equal(options.onConflict, 'user_id'); row = data; return chain },
      async single() { current = row; writes++; return { data: row } } }
    return chain
  },
  async rpc(name, args) { assert.equal(name, 'affiliate_observe_subscription'); assert.equal(args.p_actor, user); observations.push(args); return { data: null } },
}
for (const [id, period, date] of [['I-MONTHLY', 'monthly', '2026-09-01'], ['I-YEARLY', 'yearly', '2026-09-02']]) {
  incoming = { id, plan_id: period === 'monthly' ? 'P-MT' : 'P-YT', custom_id: `${user}|${period}`, status: 'APPROVAL_PENDING', create_time: `${date}T10:00:00Z` }
  const result = await synchronizePayPalSubscription({ eventType: 'BILLING.SUBSCRIPTION.CREATED', subscriptionId: id, supabase: db })
  assert.equal(result.status, 'inactive')
  assert.equal(current.provider_status, 'APPROVAL_PENDING')
  assert.equal(current.current_period_end, null)
  assert.equal(current.provider_subscription_id, id)
}
const before = structuredClone(current)
incoming = { id: 'I-OLDER', plan_id: 'P-MT', custom_id: `${user}|monthly`, status: 'ACTIVE', create_time: '2026-08-01T10:00:00Z' }
const ignored = await synchronizePayPalSubscription({ subscriptionId: incoming.id, supabase: db })
assert.equal(ignored.ignored, true)
assert.equal(ignored.reason, 'older_subscription')
assert.deepEqual(current, before, 'Entitlement freshness decision unchanged')
assert.equal(writes, 2)
assert.deepEqual(observations.map(o => o.p_subscription_id), ['I-MONTHLY', 'I-YEARLY', 'I-OLDER'])
assert.equal(observations.at(-1).p_status, 'ACTIVE', 'Ignored older paid/unknown history cannot disappear')
assert.ok(requests.every(r => r.method === 'GET' || r.url.endsWith('/oauth2/token')))
console.log('PASS feature-OFF CREATED monthly/yearly -> inactive/no Premium; eligibility evidence retained; older subscription ignored for entitlement but preserved for eligibility; mocked network only, no creations/payments')
