// Real isolated PostgreSQL ledger + mocked authoritative PayPal responses. NO provider network.
import assert from 'node:assert/strict'
import { configureAffiliateTaxFixture } from './affiliate-tax-test-fixture.mjs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { processAffiliateEvent, createCheckout } from '../server/affiliate-core.mjs'
const run=promisify(execFile), database=process.env.AFFILIATE_TEST_DATABASE || 'affiliate_test5'
if(!/^affiliate_test\d+$/.test(database)) throw Error('Only isolated affiliate_testN databases permitted')
const binary=process.env.AFFILIATE_TEST_PSQL || 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe'
async function sql(query) {
 const {stdout}=await run(binary,['-X','-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At','-c',query],{windowsHide:true,maxBuffer:1024*1024})
 return stdout.trim().split('\n').filter(x=>x.startsWith('{')||/^\d+$/.test(x)).at(-1)
}
const quote=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`
const owner='30000000-0000-4000-8000-000000000001', buyer='30000000-0000-4000-8000-000000000002'
await sql(`insert into auth.users(id,email,email_confirmed_at) values('${owner}','integration-owner@test.invalid',now()),('${buyer}','integration-buyer@test.invalid',now()); set role service_role; select affiliate_command('${owner}','activate','{"code":"integration-owner","display_name":"Integration","accept_terms":true,"terms_version":"2026-09-07"}'); select affiliate_command('${buyer}','track','{"code":"integration-owner","token_hash":"integration-cookie","destination":"/pricing"}');`)
const db={rpc:async(name,args)=>{try{return{data:JSON.parse(await sql(`set role service_role; select ${name}(${quote(args.p)});`))}}catch(error){return{error}}}}
process.env.AFFILIATE_PROGRAM_ENABLED='true'
process.env.PAYPAL_MODE='sandbox'
delete process.env.PAYPAL_API_BASE_URL
process.env.AFFILIATE_CHECKOUT_ORIGIN='http://127.0.0.1:4250'
for(const [name,id] of Object.entries({MONTHLY_STANDARD:'P-MS',MONTHLY_TAXED:'P-MT',YEARLY_STANDARD:'P-YS',YEARLY_TAXED:'P-YT'})) process.env[`PAYPAL_PLAN_${name}`]=id
configureAffiliateTaxFixture()
const sale={id:'INTSALE',state:'completed',billing_agreement_id:'I-INTEGRATION',amount:{total:'500.00',currency:'USD',details:{tax:'50.00'}},transaction_fee:{value:'9.00'},create_time:new Date().toISOString()}
const provider=async path=>path.includes('/sale/')?sale:path.includes('/refund/')?{id:'INTREFUND',sale_id:'INTSALE',state:'completed',amount:{total:'250.00',currency:'USD'}}:{id:'I-INTEGRATION',plan_id:'P-MS',custom_id:`${buyer}|monthly`}
const event={id:'WH-INTEGRATION',event_type:'PAYMENT.SALE.COMPLETED',resource:{id:'INTSALE'}}
await Promise.all(Array.from({length:8},()=>processAffiliateEvent(event,db,provider)))
assert.equal(await sql("select count(*) from affiliate_commissions where payment_id='INTSALE'"),'1')
assert.equal(await sql("select amount_minor from affiliate_commissions where payment_id='INTSALE'"),'6750')
await Promise.all(Array.from({length:4},()=>processAffiliateEvent({id:'WH-REFUND',event_type:'PAYMENT.SALE.REFUNDED',resource:{id:'INTREFUND',sale_id:'INTSALE'}},db,provider)))
assert.equal(await sql("select reversed_minor from affiliate_commissions where payment_id='INTSALE'"),'3375')
assert.equal(await sql("select count(*) from affiliate_reversals where payment_id='INTSALE'"),'1')
await processAffiliateEvent({id:'WH-CHARGEBACK',event_type:'PAYMENT.SALE.REVERSED',resource:{id:'INTSALE'}},db,provider)
assert.equal(await sql("select reversed_minor from affiliate_commissions where payment_id='INTSALE'"),'6750')

// Checkout provider contract: server chooses plan, stable request key, failed/cancelled retries.
process.env.PAYPAL_AFFILIATE_PLAN_MONTHLY_STANDARD='P-INTRO'
const frequency={interval_unit:'MONTH',interval_count:1}, fixed=value=>({fixed_price:{currency_code:'USD',value}})
const base={id:'P-MS',status:'ACTIVE',product_id:'PROD',billing_cycles:[{tenure_type:'REGULAR',sequence:1,total_cycles:0,frequency,pricing_scheme:fixed('10.00')}]}
const intro={...base,id:'P-INTRO',billing_cycles:[{tenure_type:'TRIAL',sequence:1,total_cycles:1,frequency,pricing_scheme:fixed('9.00')},{...base.billing_cycles[0],sequence:2}]}
let open=null, closed=false, posts=[]
const checkout={id:'40000000-0000-4000-8000-000000000001',plan_id:'P-INTRO',discount_bps:1000}
const checkoutDb={from:()=>{const chain={select:()=>chain,eq:()=>chain,is:()=>chain,update:()=>chain,maybeSingle:async()=>({data:open})};return chain},rpc:async(name,{p_action})=>{if(name==='affiliate_eligibility_history')return{data:{ids:[],blocked:false,fingerprint:'fixture'}};if(name==='affiliate_checkout_selection')return{data:{eligible:true,can_create:true,plan_id:'P-INTRO',rate_bps:1500,affiliate_id:owner,reason:'ELIGIBLE'}};if(p_action==='close_checkout')closed=true;return{data:checkout}}}
const request=async(path,options)=>{if(options?.method==='POST'){posts.push(JSON.parse(options.body));assert.equal(options.headers['PayPal-Request-Id'],checkout.id);return{id:'I-CREATED'}}return path.includes('/subscriptions/')?{status:'CANCELLED'}:path.endsWith('P-MS')?base:intro}
assert.equal((await createCheckout(checkoutDb,{id:buyer},{headers:{},body:{period:'monthly',discount_bps:9999}},request)).discount_bps,1000)
assert.equal(posts[0].plan_id,'P-INTRO')
assert.equal(posts[0].application_context.return_url,'http://127.0.0.1:4250/pricing')
assert.equal(posts[0].application_context.cancel_url,'http://127.0.0.1:4250/pricing')
open={...checkout,subscription_id:'I-CANCELLED',created_at:new Date().toISOString()}
await createCheckout(checkoutDb,{id:buyer},{headers:{},body:{period:'monthly'}},request)
assert.equal(closed,true)
await assert.rejects(()=>createCheckout(checkoutDb,{id:buyer},{headers:{},body:{period:'monthly'}},async()=>({status:'CANCELLED',billing_info:{last_payment:{amount:{value:'9.00'}}}})),/reconciled/)
process.env.AFFILIATE_PAYPAL_TAX_BPS_JSON='{}'
await assert.rejects(()=>createCheckout(checkoutDb,{id:buyer},{headers:{},body:{period:'monthly'}},request),/AFFILIATE_TAX_CONFIG_INVALID/)
console.log('PASS real PostgreSQL + mocked PayPal: 8 concurrent duplicate payments, 4 concurrent refunds, chargeback cap, cents/tax/fees, server plan selection, stable checkout idempotency, cancelled-unpaid retry, collected-history and missing-tax fail-closed gates')
