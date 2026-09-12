import { createHash, randomBytes } from 'node:crypto'
import { configuredPlans, paypalRequest, getPayPalMode, getPayPalBaseUrl } from './paypal-subscription-core.mjs'
import { checkoutHistoryProof } from './affiliate-eligibility.mjs'
import { affiliateTaxConfig } from './affiliate-tax-config.mjs'
import { pendingPayPalReader } from './affiliate-pending-paypal-read.mjs'

export const TERMS_VERSION = '2026-09-07'
export const enabled = () => process.env.AFFILIATE_PROGRAM_ENABLED === 'true'
export function affiliateCheckoutOrigin() {
  const live=getPayPalMode()==='live'
  const expected=live?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com'
  if(getPayPalBaseUrl()!==expected) throw new Error('PayPal API endpoint does not match the selected environment')
  const configured=process.env.AFFILIATE_CHECKOUT_ORIGIN || (live?'https://weisschess.com':'')
  if(!configured) throw new Error('AFFILIATE_CHECKOUT_ORIGIN is required for sandbox checkout')
  const url=new URL(configured)
  const loopback=['localhost','127.0.0.1'].includes(url.hostname)
  if(url.username || url.password || url.search || url.hash || url.pathname!=='/' || (url.protocol!=='https:' && !(loopback && url.protocol==='http:')) || (live && url.origin!=='https://weisschess.com') || (!live && ['weisschess.com','www.weisschess.com'].includes(url.hostname))) throw new Error('Checkout origin must match the isolated sandbox or canonical production site')
  return url.origin
}
export function minor(value) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(String(value))) throw new Error('Invalid USD amount')
  const [whole, fraction = ''] = String(value).split('.')
  return Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')))
}
export const rate = (tier, override = null) => override ?? [0,1500,2000,3000,2500,3500][tier]
export const commission = (eligible, bps) => Number((BigInt(eligible)*BigInt(bps)+5000n)/10000n)
export function collectedTax(gross, providerTax, taxBps) {
  const reported = providerTax === undefined ? null : minor(providerTax)
  // These fixed-price plans embed VAT: PayPal's zero means it added no tax,
  // not that the collected gross is VAT-free. Positive verified tax still wins.
  if (reported !== null && reported > 0) {
    if (reported > gross) throw new Error('Verified tax exceeds collected gross')
    return reported
  }
  if (!Number.isInteger(taxBps) || taxBps < 0 || taxBps > 10000) throw new Error('Verified sale tax or explicit plan tax mapping required')
  return Number((BigInt(gross)*BigInt(taxBps)+BigInt(10000+taxBps)/2n)/BigInt(10000+taxBps))
}
export const firstDiscount = (eligible, promotionBps = 0) => Math.max(eligible ? 1000 : 0, promotionBps)
export function destination(value) {
  const url = new URL(String(value || '/'), 'https://weisschess.com')
  if (url.origin !== 'https://weisschess.com' || url.username || url.password || /[\x00-\x1f\\]/.test(String(value))) throw new Error('Only Weiss Chess destinations are allowed')
  url.searchParams.delete('ref')
  return `${url.pathname}${url.search}${url.hash}`.slice(0,1500)
}
export function code(value) {
  const v = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(v)) throw new Error('Use 3–32 lowercase letters, numbers or hyphens for the code')
  return v
}
export function profileInput(body) {
  const display_name = String(body.display_name || '').trim()
  const paypal_email = String(body.paypal_email || '').trim().toLowerCase()
  if (!display_name || display_name.length>100) throw new Error('Display name must contain 1–100 characters')
  if (paypal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypal_email)) throw new Error('Invalid PayPal email')
  const links = (Array.isArray(body.links) ? body.links : []).slice(0,8).map(httpsUrl)
  return { display_name, paypal_email, ...(body.links === undefined ? {} : {links}) }
}
export function httpsUrl(value) {
  const url = new URL(String(value))
  if (url.protocol!=='https:' || url.username || url.password || url.href.length>500) throw new Error('Profile links must be public HTTPS URLs')
  return url.href
}
export function visitor(req) {
  const saved = String(req.headers.cookie || '').match(/(?:^|;\s*)weiss_aff=([a-f0-9]{64})(?:;|$)/)?.[1]
  const token = saved || randomBytes(32).toString('hex')
  return { token, hash:createHash('sha256').update(token).digest('hex'), exists:!!saved }
}
export async function command(db, actor, action, data={}) {
  const result = await db.rpc('affiliate_command', {p_actor:actor,p_action:action,p_data:data})
  if (result.error) throw new Error(result.error.code === '23505' ? 'That code, application, or payout already exists' : result.error.message)
  return result.data
}
export function affiliatePlans() {
  return new Map(['MONTHLY','YEARLY'].flatMap(period => ['STANDARD','TAXED'].map(tax => [String(process.env[`PAYPAL_AFFILIATE_PLAN_${period}_${tax}`] || ''),period.toLowerCase()])).filter(([id])=>id))
}
export function validateIntroPlan(base, intro, expectedPeriod) {
  const baseCycles=base.billing_cycles || [], cycles=intro.billing_cycles || []
  const regular=baseCycles[0], trial=cycles[0], renewal=cycles[1]
  const price = cycle => cycle?.pricing_scheme?.fixed_price
  if(!base.product_id || !['MONTH','YEAR'].includes(regular?.frequency?.interval_unit) || regular.frequency.interval_count!==1 || (expectedPeriod && regular.frequency.interval_unit!==(expectedPeriod==='monthly'?'MONTH':'YEAR')) || minor(price(regular)?.value || '0')<=0 || minor(base.payment_preferences?.setup_fee?.value || '0')!==0) throw new Error('Unsupported or mismatched base billing plan; reconcile provider configuration')
  if (base.status!=='ACTIVE' || intro.status!=='ACTIVE' || base.product_id!==intro.product_id || baseCycles.length!==1 || cycles.length!==2 || regular.tenure_type!=='REGULAR' || trial.tenure_type!=='TRIAL' || trial.sequence!==1 || trial.total_cycles!==1 || renewal.tenure_type!=='REGULAR' || renewal.sequence!==2 || renewal.total_cycles!==regular.total_cycles || JSON.stringify(trial.frequency)!==JSON.stringify(regular.frequency) || JSON.stringify(renewal.frequency)!==JSON.stringify(regular.frequency) || price(trial)?.currency_code!=='USD' || price(renewal)?.currency_code!=='USD' || price(regular)?.currency_code!=='USD' || minor(price(renewal).value)!==minor(price(regular).value) || minor(price(trial).value)!==commission(minor(price(regular).value),9000) || JSON.stringify(base.taxes || null)!==JSON.stringify(intro.taxes || null) || minor(intro.payment_preferences?.setup_fee?.value || '0')!==0) throw new Error('PayPal introductory plan does not match the approved one-payment 10% discount contract')
}
export async function checkoutDecision(db,user,req,requestPayPal=paypalRequest) {
  affiliateCheckoutOrigin()
  const period=req.body.period
  if (!['monthly','yearly'].includes(period)) throw new Error('Invalid billing period')
  const tax=String(req.headers['x-vercel-ip-country'] || '').toUpperCase()==='IL'?'TAXED':'STANDARD'
  const normal=process.env[`PAYPAL_PLAN_${period.toUpperCase()}_${tax}`]
  if (!configuredPlans().has(normal)) throw new Error('Billing plans unavailable')
  const intro=process.env[`PAYPAL_AFFILIATE_PLAN_${period.toUpperCase()}_${tax}`] || ''
  const taxMap=affiliateTaxConfig()
  const cookie=visitor(req)
  // Preview and checkout share the fail-closed production history verifier.
  // Tests may inject synthetic provider details.
  const history_proof=await checkoutHistoryProof(db,user.id,new Map([...configuredPlans(),...affiliatePlans()]),requestPayPal===paypalRequest?undefined:requestPayPal)
  const input={period,normal_plan:normal,discount_plan:intro,history_proof,...(cookie.exists?{token_hash:cookie.hash}:{})}
  const result=await db.rpc('affiliate_checkout_selection',{p_actor:user.id,p_data:input})
  if(result.error || !result.data || typeof result.data.eligible!=='boolean' || typeof result.data.can_create!=='boolean') throw new Error('Checkout decision unavailable')
  const decision=result.data
  if(decision.plan_id!==(decision.eligible?intro:normal)) throw new Error('Checkout selection/configuration mismatch')
  // Sanitized server diagnostic. No credentials, cookie, fingerprint, or payer data.
  console.info('Affiliate checkout decision',JSON.stringify({feature_enabled:enabled(),authenticated:true,
    attribution_present:decision.attribution_present,affiliate_code:decision.affiliate_code,
    affiliate_active:decision.affiliate_active,self_referral:decision.self_referral,expires_at:decision.expires_at,
    consumed:decision.locked,history_clear:decision.history_clear,history_reason:history_proof.reason,
    verified_pending:history_proof.verifications,provider_reads:history_proof.diagnostics,pricing_variant:tax,period,intro_mapping_present:!!intro,tax_mapping_valid:true,
    eligible:decision.eligible,reason:decision.reason,can_create:decision.can_create,selected_plan:decision.plan_id,open_plan:decision.open_plan_id}))
  const ordinaryReasons=new Set(['NO_REFERRAL','EXPIRED_REFERRAL','INACTIVE_OR_INVALID_AFFILIATE','SELF_REFERRAL','PAID_OR_CONSUMED'])
  if(!decision.eligible && !ordinaryReasons.has(decision.reason)) {
    throw Object.assign(new Error('Affiliate eligibility is temporarily unavailable. Please try again later; no subscription was created.'),{code:'AFFILIATE_ELIGIBILITY_UNAVAILABLE',reason:history_proof.reason})
  }
  const base=await requestPayPal(`/v1/billing/plans/${normal}`)
  if(base?.id!==normal || base.status!=='ACTIVE' || base.billing_cycles?.[0]?.pricing_scheme?.fixed_price?.currency_code!=='USD') throw new Error('Normal plan identity or currency unavailable')
  const selected=decision.eligible?await requestPayPal(`/v1/billing/plans/${intro}`):base
  if(selected?.id!==decision.plan_id) throw new Error('Selected provider plan identity mismatch')
  if(decision.eligible) validateIntroPlan(base,selected,period)
  const first=minor(selected.billing_cycles[0].pricing_scheme.fixed_price.value)
  const renewal=minor(base.billing_cycles[0].pricing_scheme.fixed_price.value)
  const vat=collectedTax(first,undefined,taxMap[decision.plan_id]),net=first-vat
  const bps=decision.affiliate_id?decision.rate_bps:0
  return {input,decision,preview:{pricing_variant:tax,period,attribution_present:decision.attribution_present,
    affiliate_code:decision.affiliate_code,discount_eligible:decision.eligible,
    eligibility_reason:decision.eligible?history_proof.reason:decision.reason,
    checkout_ready:decision.can_create,checkout_blocker:decision.can_create?null:decision.reason,
    selected_plan_id:decision.plan_id,first_amount_cents:first,
    renewal_amount_cents:renewal,vat_cents:vat,eligible_revenue_cents:net,commission_rate_bps:bps,
    expected_commission_cents:commission(net,bps)}}
}
export async function previewCheckout(db,user,req,requestPayPal=paypalRequest) {
  return (await checkoutDecision(db,user,req,requestPayPal)).preview
}
export async function createCheckout(db,user,req,requestPayPal=paypalRequest) {
  if(!enabled()) throw new Error('Affiliate checkout is disabled')
  const checkoutOrigin=affiliateCheckoutOrigin()
  const period=req.body.period
  if (!['monthly','yearly'].includes(period)) throw new Error('Invalid billing period')
  affiliateTaxConfig()
  const open=await db.from('affiliate_checkouts').select('*').eq('user_id',user.id).is('closed_at',null).maybeSingle()
  if(open.error) throw open.error
  if(open.data?.subscription_id) {
    const read=requestPayPal===paypalRequest?pendingPayPalReader([],[open.data.subscription_id]):requestPayPal
    let prior
    try { prior=await read(`/v1/billing/subscriptions/${open.data.subscription_id}`) }
    catch { throw Object.assign(new Error('Affiliate eligibility is temporarily unavailable. Please try again later; no subscription was created.'),{code:'AFFILIATE_ELIGIBILITY_UNAVAILABLE',reason:'PROVIDER_UNAVAILABLE'}) }
    if(['CANCELLED','EXPIRED'].includes(prior.status)) {
      if(prior.billing_info?.last_payment) throw new Error('Previous collected payment must be reconciled before starting another checkout')
      await command(db,user.id,'close_checkout',{id:open.data.id})
    } else if(prior.status!=='APPROVAL_PENDING') throw new Error('An approved subscription already exists; manage it from Account')
  } else if(open.data && Date.now()-Date.parse(open.data.created_at)>48*3600000) {
    throw new Error('Unresolved checkout requires provider reconciliation before retry; no new subscription was created')
  }
  const cookie=visitor(req)
  if(cookie.exists) await command(db,user.id,'bind',{token_hash:cookie.hash})
  const {input,decision}=await checkoutDecision(db,user,req,requestPayPal)
  if(!decision.can_create) throw new Error(`${decision.reason}: existing checkout requires reconciliation; no new subscription was created`)
  const checkout=await command(db,user.id,'checkout',{...input,expected_plan:decision.plan_id})
  if(checkout.plan_id!==decision.plan_id) throw new Error('Checkout decision changed; no new subscription was created')
  if(checkout.subscription_id) return {id:checkout.subscription_id,discount_bps:checkout.discount_bps}
  const subscription=await requestPayPal('/v1/billing/subscriptions',{method:'POST',headers:{'PayPal-Request-Id':checkout.id},body:JSON.stringify({plan_id:checkout.plan_id,custom_id:`${user.id}|${period}`,application_context:{brand_name:'Weiss Chess',user_action:'SUBSCRIBE_NOW',return_url:`${checkoutOrigin}/pricing`,cancel_url:`${checkoutOrigin}/pricing`}})})
  if(!/^I-[A-Z0-9]+$/i.test(subscription.id || '')) throw new Error('PayPal did not return a valid subscription identity')
  const result=await db.from('affiliate_checkouts').update({subscription_id:subscription.id}).eq('id',checkout.id).eq('user_id',user.id)
  if(result.error) throw result.error
  return {id:subscription.id,discount_bps:checkout.discount_bps}
}

// Called only AFTER cryptographic webhook verification, never by browser payment claims.
export async function processAffiliateEvent(event, db, requestPayPal=paypalRequest) {
  if(!enabled() || !['PAYMENT.SALE.COMPLETED','PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED'].includes(event.event_type)) return null
  const taxMap=affiliateTaxConfig()
  const resource=event.resource || {}, isPayment=event.event_type==='PAYMENT.SALE.COMPLETED'
  const saleId=isPayment || event.event_type==='PAYMENT.SALE.REVERSED' ? resource.id : resource.sale_id
  if(!/^[A-Z0-9]+$/i.test(String(saleId || ''))) throw new Error('Missing authoritative sale ID; reconcile webhook before retry')
  const sale=await requestPayPal(`/v1/payments/sale/${saleId}`)
  if(sale.id!==saleId) throw new Error('Sale identity mismatch')
  const subscriptionId=sale.billing_agreement_id
  if(!/^I-[A-Z0-9]+$/i.test(subscriptionId || '')) throw new Error('Missing verified subscription identity')
  const details=await requestPayPal(`/v1/billing/subscriptions/${subscriptionId}`)
  if(details.id!==subscriptionId) throw new Error('Subscription identity mismatch')
  const plans=new Map([...configuredPlans(),...affiliatePlans()])
  const [userId,period,extra]=String(details.custom_id || '').split('|')
  if(!/^[0-9a-f-]{36}$/i.test(userId || '') || extra!==undefined || plans.get(details.plan_id)!==period) throw new Error('Unrecognized payment account/plan')
  if(affiliatePlans().has(details.plan_id)) {
    const check=await db.from('affiliate_checkouts').select('user_id,subscription_id').eq('subscription_id',subscriptionId).maybeSingle()
    if(check.error || check.data?.user_id!==userId) throw new Error('Discount subscription lacks server-authorized checkout')
  }
  const gross=minor(sale.amount?.total), currency=sale.amount?.currency
  if(currency!=='USD') throw new Error('Unexpected billing currency')
  const taxBps=taxMap[details.plan_id]
  const tax=collectedTax(gross,sale.amount?.details?.tax,taxBps)
  if(!['completed','refunded','partially_refunded','reversed'].includes(String(sale.state).toLowerCase())) throw new Error('Sale is not collected')
  const payment={kind:'payment',payment_id:saleId,event_id:`sale:${saleId}`,user_id:userId,subscription_id:subscriptionId,currency,gross_minor:gross,tax_minor:tax,occurred_at:sale.create_time}
  // Persist original collection first even if refunds arrive out of order.
  let result=await db.rpc('affiliate_record_payment',{p:payment}); if(result.error) throw result.error
  if(!isPayment) {
    const refund=event.event_type==='PAYMENT.SALE.REFUNDED' ? await requestPayPal(`/v1/payments/refund/${resource.id}`) : null
    if(refund && (refund.id!==resource.id || refund.sale_id!==saleId || refund.state!=='completed' || refund.amount?.currency!==currency)) throw new Error('Unverified refund identity or currency')
    const refundTax=refund?.amount?.details?.tax===undefined?undefined:minor(refund.amount.details.tax)
    // A zero from a no-added-tax plan must use the ledger's proportional
    // reversal of the original net/VAT, including exact full-refund closure.
    const explicitRefundTax=refundTax!==undefined && (refundTax>0 || tax===0)
    result=await db.rpc('affiliate_record_payment',{p:{kind:'reversal',payment_id:saleId,event_id:event.id,reversal_id:refund?.id || `reversal:${saleId}`,user_id:userId,currency,gross_minor:refund?minor(refund.amount.total):gross,...(explicitRefundTax?{refund_tax_minor:refundTax}:{}),reason:event.event_type}})
    if(result.error) throw result.error
  }
  return {subscriptionId,processed:true}
}
