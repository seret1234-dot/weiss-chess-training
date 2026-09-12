// Real LOCAL SQL + synthetic authoritative provider fixtures. Never calls PayPal.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { checkoutHistoryProof } from '../server/affiliate-eligibility.mjs'
const run = promisify(execFile), database = process.env.AFFILIATE_TEST_DATABASE
if (!/^affiliate_test\d+$/.test(database || '')) throw Error('Isolated affiliate_testN database required')
globalThis.fetch = async () => { throw Error('Network forbidden') }
const binary = 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe'
async function sql(query) {
  const { stdout } = await run(binary, ['-X', '-h', '127.0.0.1', '-p', '55439', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', '-c', `set statement_timeout='10s';${query}`], { windowsHide: true })
  return stdout.trim().split('\n').at(-1)
}
const quote = v => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`
const uid = n => `71000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const owner = uid(1)
const db = { rpc: async (name, args) => {
  assert.ok(['affiliate_eligibility_history', 'affiliate_command', 'affiliate_record_payment'].includes(name))
  try { return { data: JSON.parse(await sql(`set role service_role;select ${name}(${name === 'affiliate_record_payment' ? quote(args.p) : `'${args.p_actor}'${name === 'affiliate_command' ? `,'${args.p_action}',${quote(args.p_data)}` : ''}`});`)) } }
  catch (error) { return { error } }
} }
async function rpc(name, args) { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data }
const command = (n, action, data = {}) => rpc('affiliate_command', { p_actor: uid(n), p_action: action, p_data: data })
const plans = new Map([['P-NORMAL', 'monthly'], ['P-YEARLY', 'yearly'], ['P-INTRO', 'monthly']])
const subscriptions = new Map()
const provider = async path => {
  const id = path.split('/')[4]
  const d = subscriptions.get(id)
  if (!d) throw Error('Provider unavailable')
  return path.includes('/transactions?') ? { transactions: [], total_items: 0, total_pages: 0 } : d
}
function pending(n, id, period = 'monthly') {
  subscriptions.set(id, { id, plan_id: period === 'monthly' ? 'P-NORMAL' : 'P-YEARLY', custom_id: `${uid(n)}|${period}`, status: 'APPROVAL_PENDING', create_time: new Date(Date.now() - 3600000).toISOString() })
}
const proof = n => checkoutHistoryProof(db, uid(n), plans, provider)
const checkout = (n, history_proof) => command(n, 'checkout', { period: 'monthly', normal_plan: 'P-NORMAL', discount_plan: 'P-INTRO', history_proof })
async function local(n, id, status = 'inactive', providerStatus = 'APPROVAL_PENDING', period = 'monthly') {
  await sql(`insert into subscriptions(user_id,provider,provider_subscription_id,plan,status,provider_status) values('${uid(n)}','paypal','${id}','${period}','${status}',${providerStatus === null ? 'null' : `'${providerStatus}'`}) on conflict(user_id) do update set provider_subscription_id=excluded.provider_subscription_id,status=excluded.status,provider_status=excluded.provider_status;`)
}
await sql(`insert into auth.users(id,email,email_confirmed_at) select ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'pending-fixture-'||n||'@test.invalid',now() from generate_series(1,14)n;`)
await command(1, 'activate', { code: 'pending-fixture', display_name: 'Pending test', accept_terms: true, terms_version: '2026-09-07' })
for (let n = 2; n <= 14; n++) await command(n, 'track', { code: 'pending-fixture', destination: '/pricing', token_hash: `pending-${n}` })
assert.equal((await checkout(2, await proof(2))).discount_bps, 1000, 'H no history')

pending(3, 'I-ORDINARYMONTHLY'); await local(3, 'I-ORDINARYMONTHLY')
const before = await sql(`select to_jsonb(s) from subscriptions s where user_id='${uid(3)}'`)
const p3 = await proof(3)
const attempts = await Promise.all(Array.from({ length: 8 }, () => checkout(3, p3)))
assert.equal(new Set(attempts.map(c => c.id)).size, 1, 'Concurrent retries share ONE checkout intent')
assert.ok(attempts.every(c => c.discount_bps === 1000), 'A pending ordinary monthly eligible')
assert.equal(await sql(`select to_jsonb(s) from subscriptions s where user_id='${uid(3)}'`), before, 'Proof/checkout must not modify entitlement row')
assert.equal(await sql(`select count(*) from affiliate_payments where user_id='${uid(3)}'`), '0')
assert.equal(await sql(`select count(*) from affiliate_commissions c join affiliate_payments p on c.payment_id=p.payment_id where p.user_id='${uid(3)}'`), '0')

await local(4, 'I-UNVERIFIABLE')
assert.equal((await checkout(4, await proof(4))).discount_bps, 0, 'B provider unavailable')
for (const [n, status] of [[5, 'ACTIVE'], [6, 'CANCELLED'], [7, 'EXPIRED']]) {
  await local(n, `I-PAID${n}`, status.toLowerCase(), status)
  await rpc('affiliate_record_payment', { p: { kind: 'payment', payment_id: `PAID${n}`, event_id: `paid:${n}`, user_id: uid(n), subscription_id: `I-PAID${n}`, currency: 'USD', gross_minor: 1000, tax_minor: 0, occurred_at: new Date().toISOString() } })
  assert.equal((await checkout(n, await proof(n))).discount_bps, 0, `C/D/E ${status} paid history`)
}
await local(8, 'I-LEGACY', 'inactive', null)
pending(8, 'I-LEGACY')
assert.equal((await checkout(8, await proof(8))).discount_bps, 0, 'G unknown legacy history remains blocked even if latest provider says pending')

pending(9, 'I-THENPAID'); await local(9, 'I-THENPAID')
const p9 = await proof(9)
const payment = { kind: 'payment', payment_id: 'PENDINGPAID', event_id: 'sale:PENDINGPAID', user_id: uid(9), subscription_id: 'I-THENPAID', currency: 'USD', gross_minor: 900, tax_minor: 0, occurred_at: new Date().toISOString() }
await Promise.all(Array.from({ length: 8 }, () => rpc('affiliate_record_payment', { p: payment })))
assert.equal((await checkout(9, p9)).discount_bps, 0, 'F payment arriving after provider proof wins')
assert.equal(await sql("select count(*) from affiliate_payments where payment_id='PENDINGPAID'"), '1')
assert.equal(await sql("select count(*) from affiliate_commissions where payment_id='PENDINGPAID'"), '1')
await rpc('affiliate_record_payment', { p: { kind: 'reversal', payment_id: 'PENDINGPAID', event_id: 'refund:PENDINGPAID', reversal_id: 'REFUNDPENDING', user_id: uid(9), currency: 'USD', gross_minor: 900, reason: 'Fixture full refund' } })
assert.equal((await rpc('affiliate_eligibility_history', { p_actor: uid(9) })).blocked, true, 'Refund cannot restore consumed discount')

pending(10, 'I-FIRST'); pending(10, 'I-SECOND', 'yearly')
await local(10, 'I-FIRST'); await local(10, 'I-SECOND', 'inactive', 'APPROVAL_PENDING', 'yearly')
assert.deepEqual((await proof(10)).ids, ['I-FIRST', 'I-SECOND'])
assert.equal((await checkout(10, await proof(10))).discount_bps, 1000, 'Multiple abandoned ordinary monthly/yearly do not poison eligibility')
subscriptions.get('I-FIRST').status = 'ACTIVE'
await assert.rejects(checkout(10, await proof(10)), /OPEN_CHECKOUT_PLAN_MISMATCH/, 'Old pending later active blocks reusing discounted intent')

await local(11, 'I-OLDPAID', 'active', 'ACTIVE'); await local(11, 'I-NEWPENDING')
pending(11, 'I-NEWPENDING')
assert.equal((await checkout(11, await proof(11))).discount_bps, 0, 'Later pending row cannot erase earlier active history')
pending(12, 'I-SNAPSHOT'); await local(12, 'I-SNAPSHOT'); const p12 = await proof(12)
pending(12, 'I-DRIFT'); await local(12, 'I-DRIFT')
assert.equal((await checkout(12, p12)).discount_bps, 0, 'History changed during verification')
pending(13, 'I-STALE'); await local(13, 'I-STALE'); const p13 = await proof(13)
p13.checked_at = new Date(Date.now() - 120000).toISOString()
assert.equal((await checkout(13, p13)).discount_bps, 0, 'Expired proof')

// Real transaction race: payment owns the SAME customer lock before checkout.
pending(14, 'I-RACE'); await local(14, 'I-RACE'); const p14 = await proof(14)
const racePayment = { ...payment, payment_id: 'RACEPAID', event_id: 'sale:RACEPAID', user_id: uid(14), subscription_id: 'I-RACE' }
const race = sql(`begin;set role service_role;select pg_advisory_xact_lock(hashtextextended('${uid(14)}',43));select affiliate_record_payment(${quote(racePayment)});select pg_sleep(1);commit;`)
// Wait for evidence that the test transaction actually holds its lock, not a blind timing assumption.
for (let i = 0; i < 40; i++) {
  if (await sql("select count(*) from pg_stat_activity where datname=current_database() and wait_event='PgSleep'") === '1') break
  if (i === 39) throw Error('Payment race fixture did not acquire lock')
}
const racedCheckout = await checkout(14, p14); await race
assert.equal(racedCheckout.discount_bps, 0, 'Committed concurrent payment invalidates stale unpaid proof')
for (const role of ['anon', 'authenticated']) {
  await assert.rejects(sql(`set role ${role};select affiliate_eligibility_history('${uid(3)}');`), /permission denied/)
  await assert.rejects(sql(`set role ${role};select * from affiliate_subscription_history;`), /permission denied/)
}
await assert.rejects(sql(`set role service_role;delete from affiliate_subscription_history where user_id='${uid(3)}';`), /permission denied/)
console.log('PASS real local database A–H, unchanged inactive entitlement, ordinary monthly/yearly abandoned retry, all-ID history, stale/changed proof, 8 checkout retries, 8 duplicate payments, payment/checkout race, refund guard, private service-only evidence; NO provider network')
