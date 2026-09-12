// Server-only, read-only provider proof. Local status is never proof of non-payment.
import { pendingPayPalReader } from './affiliate-pending-paypal-read.mjs'
const DAY = 86400000
const pending = (details, id, userId, plans) => {
  const [owner, period, extra] = String(details?.custom_id || '').split('|')
  return details?.id === id && owner === userId && extra === undefined
    && plans.get(details.plan_id) === period && ['monthly', 'yearly'].includes(period)
    && details.status === 'APPROVAL_PENDING'
    && !details.billing_info?.last_payment
    && (!details.billing_info?.cycle_executions || (Array.isArray(details.billing_info.cycle_executions)
      && details.billing_info.cycle_executions.every(c => c.cycles_completed === 0)))
}

export async function verifyUnpaidPending(id, userId, plans, requestPayPal, now = Date.now) {
  try {
    const started = now()
    if (!/^I-[A-Z0-9]+$/i.test(id || '')) return { eligible: false, reason: 'UNKNOWN_IDENTITY' }
    const path = `/v1/billing/subscriptions/${id}`
    const details = await requestPayPal(path)
    if (!pending(details, id, userId, plans)) return { eligible: false, reason: 'PAID_OR_NOT_VERIFIED_PENDING' }
    const created = Date.parse(details.create_time), end = now()
    // Bound checkout latency. Older/undated histories require reconciliation, never an exemption.
    if (!Number.isFinite(created) || created > end || end - created > 360 * DAY) return { eligible: false, reason: 'UNKNOWN_HISTORY_RANGE' }
    // Approved PayPal-only exception: exact APPROVAL_PENDING details establish
    // pre-approval state. Its history resource may return 404; do not request it
    // or claim an empty transaction history. Local paid/entitled/consumed history
    // still blocks in affiliate_eligibility_history and the atomic checkout guard.
    const latest = await requestPayPal(path)
    if (!pending(latest, id, userId, plans) || latest.create_time !== details.create_time || latest.plan_id !== details.plan_id) {
      return { eligible: false, reason: 'PROVIDER_CHANGED_DURING_VERIFICATION' }
    }
    if (now() < started || now() - started > 60_000) return { eligible: false, reason: 'STALE_PROVIDER_PROOF' }
    return { eligible: true, reason: 'VERIFIED_UNPAID_PENDING', proof_basis: 'FRESH_APPROVAL_PENDING_DETAILS',
      transaction_history_status: 'NOT_APPLICABLE_APPROVAL_PENDING', transaction_count: null }
  } catch (error) {
    return { eligible: false, reason: 'PROVIDER_UNAVAILABLE', ...(error.providerDiagnostic?{diagnostic:error.providerDiagnostic}:{}) }
  }
}

export async function checkoutHistoryProof(db, userId, plans, requestPayPal, now = Date.now) {
  const started = now()
  const { data: history, error } = await db.rpc('affiliate_eligibility_history', { p_actor: userId })
  if (error) throw new Error('Eligibility history unavailable; no checkout was created')
  if (!history || !Array.isArray(history.ids) || typeof history.fingerprint !== 'string' || typeof history.blocked !== 'boolean') throw new Error('Invalid eligibility history')
  const proof = { fingerprint: history.fingerprint, checked_at: new Date(started).toISOString(), ids: [], reason: 'NO_SUBSCRIPTION_HISTORY', verifications: [] }
  if (history.blocked || history.ids.length > 12) {
    proof.reason = history.blocked ? 'LOCAL_PAID_CONSUMED_OR_UNKNOWN_HISTORY' : 'HISTORY_LIMIT_EXCEEDED'
    return proof
  }
  const diagnostics=[]
  const read=requestPayPal || pendingPayPalReader(diagnostics,history.ids)
  // All bounded authoritative IDs are inspected; one outage no longer hides the
  // state of the remaining objects. The SQL guard still requires EVERY ID.
  const results=await Promise.all(history.ids.map(async id=>({id,result:await verifyUnpaidPending(id,userId,plans,read,now)})))
  proof.verifications=results.map(({id,result})=>({id,classification:result.reason,...(result.diagnostic?{diagnostic:result.diagnostic}:{})}))
  proof.ids=results.filter(({result})=>result.eligible).map(({id})=>id)
  if (history.ids.length) proof.reason=results.find(({result})=>!result.eligible)?.result.reason || 'VERIFIED_UNPAID_PENDING'
  if(now()-started>60_000 || now()<started) {proof.reason='STALE_PROVIDER_PROOF';proof.ids=[]}
  proof.diagnostics=diagnostics
  return proof
}
