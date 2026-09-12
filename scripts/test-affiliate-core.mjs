import assert from 'node:assert/strict'
import { configureAffiliateTaxFixture } from './affiliate-tax-test-fixture.mjs'
import { readFile } from 'node:fs/promises'
import { minor, commission, rate, firstDiscount, destination, code, profileInput, visitor, validateIntroPlan, processAffiliateEvent, affiliateCheckoutOrigin } from '../server/affiliate-core.mjs'
process.env.PAYPAL_MODE='sandbox';delete process.env.PAYPAL_API_BASE_URL;delete process.env.AFFILIATE_CHECKOUT_ORIGIN
assert.throws(()=>affiliateCheckoutOrigin(),/required for sandbox/)
process.env.AFFILIATE_CHECKOUT_ORIGIN='https://weisschess.com'
assert.throws(()=>affiliateCheckoutOrigin(),/isolated sandbox/)
process.env.AFFILIATE_CHECKOUT_ORIGIN='http://127.0.0.1:4250'
assert.equal(affiliateCheckoutOrigin(),'http://127.0.0.1:4250')
process.env.PAYPAL_API_BASE_URL='https://api-m.paypal.com'
assert.throws(()=>affiliateCheckoutOrigin(),/endpoint/)
delete process.env.PAYPAL_API_BASE_URL
process.env.PAYPAL_MODE='live';delete process.env.AFFILIATE_CHECKOUT_ORIGIN
assert.equal(affiliateCheckoutOrigin(),'https://weisschess.com')
process.env.PAYPAL_MODE='sandbox'
assert.equal(minor('8.99'),899); assert.equal(minor('0.01'),1)
for(const invalid of ['NaN','-1','1.234','1e3','Infinity']) assert.throws(()=>minor(invalid))
assert.equal(commission(809,1500),121); assert.equal(commission(10000,3200),3200)
assert.deepEqual([1,2,3,4,5].map(t=>rate(t)),[1500,2000,3000,2500,3500]); assert.equal(rate(4,3200),3200)
assert.equal(firstDiscount(true),1000);assert.equal(firstDiscount(false),0);assert.equal(firstDiscount(true,2000),2000)
assert.equal(destination('/tactics?chunk=25&ref=coach#puzzle'),'/tactics?chunk=25#puzzle')
for(const url of ['https://evil.example','//evil.example','javascript:alert(1)','/\\evil.example']) assert.throws(()=>destination(url))
assert.equal(code('Coach-A'),'coach-a');assert.throws(()=>code('../x'))
assert.throws(()=>profileInput({display_name:'X',paypal_email:'invalid'}))
const v=visitor({headers:{}});assert.equal(v.token.length,64);assert.equal(visitor({headers:{cookie:`weiss_aff=${v.token}`}}).hash,v.hash)
const fixed=value=>({fixed_price:{currency_code:'USD',value}}), frequency={interval_unit:'MONTH',interval_count:1}
const base={id:'P-A',status:'ACTIVE',product_id:'PROD1',billing_cycles:[{tenure_type:'REGULAR',sequence:1,total_cycles:0,frequency,pricing_scheme:fixed('10.00')}]}
const intro={...base,id:'P-B',billing_cycles:[{tenure_type:'TRIAL',sequence:1,total_cycles:1,frequency,pricing_scheme:fixed('9.00')},{...base.billing_cycles[0],sequence:2}]}
validateIntroPlan(base,intro)
assert.throws(()=>validateIntroPlan(base,intro,'yearly'),/mismatched base/)
assert.throws(()=>validateIntroPlan({...base,product_id:''},intro),/base billing plan/)
assert.throws(()=>validateIntroPlan({...base,payment_preferences:{setup_fee:{value:'1.00'}}},intro),/base billing plan/)
for(const period of ['monthly','yearly'])for(const taxed of [false,true]){
 const frequency={interval_unit:period==='monthly'?'MONTH':'YEAR',interval_count:1}
 const normal=period==='monthly'?(taxed?'10.61':'8.99'):(taxed?'69.62':'59.00')
 const first=(commission(minor(normal),9000)/100).toFixed(2)
 const regular={...base.billing_cycles[0],frequency,pricing_scheme:fixed(normal)}
 const normalPlan={...base,billing_cycles:[regular],taxes:{percentage:taxed?'18':'0',inclusive:true}}
 const introPlan={...normalPlan,billing_cycles:[{...regular,tenure_type:'TRIAL',total_cycles:1,pricing_scheme:fixed(first)},{...regular,sequence:2}]}
 validateIntroPlan(normalPlan,introPlan,period)
 assert.throws(()=>validateIntroPlan(normalPlan,{...introPlan,billing_cycles:[{...introPlan.billing_cycles[0],total_cycles:2},introPlan.billing_cycles[1]]},period))
}
assert.throws(()=>validateIntroPlan(base,{...intro,billing_cycles:[{...intro.billing_cycles[0],total_cycles:2},intro.billing_cycles[1]]}))
assert.throws(()=>validateIntroPlan(base,{...intro,billing_cycles:[intro.billing_cycles[0],{...intro.billing_cycles[1],pricing_scheme:fixed('9.00')}]}))
process.env.AFFILIATE_PROGRAM_ENABLED='true'
for(const [name,id] of Object.entries({MONTHLY_STANDARD:'P-MS',MONTHLY_TAXED:'P-MT',YEARLY_STANDARD:'P-YS',YEARLY_TAXED:'P-YT'})) process.env[`PAYPAL_PLAN_${name}`]=id
configureAffiliateTaxFixture()
const user='10000000-0000-4000-8000-000000000003', calls=[]
const db={rpc:async(name,args)=>{calls.push({name,args});return{data:{processed:true}}}}
const sale={id:'SALE123',state:'completed',billing_agreement_id:'I-TEST',amount:{total:'9.00',currency:'USD',details:{tax:'1.00'}},transaction_fee:{value:'0.75'},create_time:'2026-09-07T10:00:00Z'}
const provider=async path=>path.includes('/sale/')?sale:path.includes('/refund/')?{id:'REF123',sale_id:'SALE123',state:'completed',amount:{total:'4.50',currency:'USD'}}:{id:'I-TEST',plan_id:'P-MS',custom_id:`${user}|monthly`}
await processAffiliateEvent({id:'WH-P1',event_type:'PAYMENT.SALE.COMPLETED',resource:{id:'SALE123'}},db,provider)
assert.equal(calls[0].args.p.gross_minor,900);assert.equal(calls[0].args.p.tax_minor,100);assert.equal(calls[0].args.p.event_id,'sale:SALE123')
await processAffiliateEvent({id:'WH-R1',event_type:'PAYMENT.SALE.REFUNDED',resource:{id:'REF123',sale_id:'SALE123'}},db,provider)
assert.equal(calls.at(-1).args.p.gross_minor,450);assert.equal(calls.at(-1).args.p.reversal_id,'REF123')
await processAffiliateEvent({id:'WH-C1',event_type:'PAYMENT.SALE.REVERSED',resource:{id:'SALE123'}},db,provider)
assert.equal(calls.at(-1).args.p.gross_minor,900)
await assert.rejects(()=>processAffiliateEvent({event_type:'PAYMENT.SALE.COMPLETED',resource:{id:'../../../bad'}},db,provider))
const source=await readFile(new URL('../api/paypal-webhook.js',import.meta.url),'utf8')
assert.ok(source.indexOf('const signatureIsValid')<source.indexOf('const affiliateResult = await processAffiliateEvent'))
assert.match(source,/if \(!signatureIsValid\)/)
console.log('PASS: integer money, tier/override, nonstacking discounts, URL validation, cookie identity, native introductory-cycle contract, verified provider fixtures, refunds and signature ordering')
