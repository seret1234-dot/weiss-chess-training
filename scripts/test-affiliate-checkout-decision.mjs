// Real isolated PostgreSQL + synthetic provider. No PayPal/network or production DB.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { previewCheckout, createCheckout } from '../server/affiliate-core.mjs'
import { configureAffiliateTaxFixture } from './affiliate-tax-test-fixture.mjs'
const database=process.env.AFFILIATE_TEST_DATABASE
if(!/^affiliate_test\d+$/.test(database||'')) throw Error('Isolated test database required')
globalThis.fetch=async()=>{throw Error('Network forbidden')}
function sql(query) {
 const text=execFileSync('C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',['-X','-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At','-c',query],{encoding:'utf8',windowsHide:true})
 return text.trim().split('\n').filter(l=>l.startsWith('{')||l.startsWith('[')||l==='true'||l==='false'||/^\d+$/.test(l)).at(-1)
}
const q=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`, uid=n=>`72000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const owner=uid(1),buyer=uid(2),providerData=new Map(),posts=[]
Object.assign(process.env,{AFFILIATE_PROGRAM_ENABLED:'true',PAYPAL_MODE:'sandbox',AFFILIATE_CHECKOUT_ORIGIN:'http://127.0.0.1:4250'})
delete process.env.PAYPAL_API_BASE_URL
configureAffiliateTaxFixture()
const normal=process.env.PAYPAL_PLAN_MONTHLY_TAXED,intro=process.env.PAYPAL_AFFILIATE_PLAN_MONTHLY_TAXED
const frequency={interval_unit:'MONTH',interval_count:1},fixed=value=>({fixed_price:{currency_code:'USD',value}})
const base={id:normal,status:'ACTIVE',product_id:'PROD',billing_cycles:[{tenure_type:'REGULAR',sequence:1,total_cycles:0,frequency,pricing_scheme:fixed('10.61')}]}
const discounted={...base,id:intro,billing_cycles:[{tenure_type:'TRIAL',sequence:1,total_cycles:1,frequency,pricing_scheme:fixed('9.55')},{...base.billing_cycles[0],sequence:2}]}
const provider=async(path,options)=>{
 if(options?.method==='POST'){posts.push(JSON.parse(options.body));return{id:'I-NEWFIXTURE'}}
 assert.equal(options,undefined)
 if(path.startsWith('/v1/billing/plans/')) return path.endsWith(normal)?base:discounted
 const value=providerData.get(path.split('/').at(-1));if(!value) throw Error('Unavailable');return value
}
let readOnly=true
const db={
 rpc:async(name,args)=>{
  assert.ok(['affiliate_eligibility_history','affiliate_checkout_selection','affiliate_command'].includes(name))
  if(readOnly) assert.notEqual(name,'affiliate_command','Preview cannot invoke the mutating command')
  const arg=`'${args.p_actor}'${name==='affiliate_command'?`,'${args.p_action}',${q(args.p_data)}`:name==='affiliate_checkout_selection'?`,${q(args.p_data)}`:''}`
  try{return{data:JSON.parse(sql(`${readOnly?'begin read only;':''}set role service_role; select ${name}(${arg});${readOnly?'rollback;':''}`))}}catch(error){return{error}}
 },
 from(table){assert.equal(readOnly,false,'Preview has no direct table writes');assert.equal(table,'affiliate_checkouts');let patch;const chain={select:()=>chain,eq:()=>chain,is:()=>chain,update:value=>{patch=value;return chain},then:resolve=>{if(patch)sql(`update affiliate_checkouts set subscription_id='${patch.subscription_id}' where user_id='${buyer}' and closed_at is null`);resolve({})},maybeSingle:async()=>({data:JSON.parse(sql(`select coalesce((select to_jsonb(c) from affiliate_checkouts c where user_id='${buyer}' and closed_at is null),'{}'::jsonb)`))})};return chain}
}
const command=(n,action,data={})=>sql(`set role service_role;select affiliate_command('${uid(n)}','${action}',${q(data)})`)
sql(`insert into auth.users(id,email,email_confirmed_at) select ('72000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'decision-'||n||'@test.invalid',now() from generate_series(1,9)n`)
command(1,'activate',{code:'decision-owner',display_name:'Fixture',accept_terms:true,terms_version:'2026-09-07'})
for(const n of [2,3,4,5,6,7,8])command(n,'track',{code:'decision-owner',destination:'/pricing',token_hash:`decision-${n}`})
function pending(id,period='monthly') {
 providerData.set(id,{id,plan_id:period==='monthly'?normal:process.env.PAYPAL_PLAN_YEARLY_TAXED,custom_id:`${buyer}|${period}`,status:'APPROVAL_PENDING',create_time:new Date(Date.now()-3600000).toISOString()})
 sql(`insert into affiliate_subscription_history(user_id,subscription_id,provider,local_status,provider_status,plan) values('${buyer}','${id}','paypal','inactive','APPROVAL_PENDING','${period}')`)
}
pending('I-EYRP06UKJ430');pending('I-W8STM7W68EY6','yearly');pending('I-VWXFNFSRYKG6')
const request={headers:{'x-vercel-ip-country':'IL'},body:{period:'monthly'}}
const preview=n=>previewCheckout(db,{id:uid(n)},request,provider)
const fingerprint=()=>sql("select jsonb_build_object('checkouts',(select coalesce(jsonb_agg(c),'[]') from affiliate_checkouts c),'referrals',(select jsonb_agg(r) from affiliate_referrals r),'history',(select jsonb_agg(h) from affiliate_subscription_history h),'payments',(select count(*) from affiliate_payments),'commissions',(select count(*) from affiliate_commissions),'subscriptions',(select count(*) from subscriptions))")
const before=fingerprint(), good=await preview(2)
assert.deepEqual(good,{pricing_variant:'TAXED',period:'monthly',attribution_present:true,affiliate_code:'decision-owner',discount_eligible:true,eligibility_reason:'VERIFIED_UNPAID_PENDING',checkout_ready:true,checkout_blocker:null,selected_plan_id:intro,first_amount_cents:955,renewal_amount_cents:1061,vat_cents:146,eligible_revenue_cents:809,commission_rate_bps:1500,expected_commission_cents:121})
assert.equal(fingerprint(),before,'Entire preview is a DB read-only transaction, zero state change');assert.equal(posts.length,0)
assert.equal((await preview(9)).selected_plan_id,normal,'No referral')
sql(`update affiliate_referrals set expires_at=now()-interval '1 day' where user_id='${uid(3)}'`)
assert.equal((await preview(3)).eligibility_reason,'EXPIRED_REFERRAL')
sql(`insert into affiliate_referrals(user_id,affiliate_id,expires_at) select '${owner}',id,now()+interval '1 day' from affiliate_accounts where user_id='${owner}'`)
assert.equal((await preview(1)).eligibility_reason,'SELF_REFERRAL')
sql(`update affiliate_referrals set locked_at=now() where user_id='${uid(4)}'`)
assert.equal((await preview(4)).eligibility_reason,'PAID_OR_CONSUMED')
providerData.get('I-EYRP06UKJ430').status='ACTIVE'
await assert.rejects(preview(2),{code:'AFFILIATE_ELIGIBILITY_UNAVAILABLE'},'Non-pending provider evidence without reconciled payment fails closed')
providerData.get('I-EYRP06UKJ430').status='APPROVAL_PENDING'
const saved=providerData.get('I-W8STM7W68EY6');providerData.delete('I-W8STM7W68EY6')
await assert.rejects(preview(2),{code:'AFFILIATE_ELIGIBILITY_UNAVAILABLE',reason:'PROVIDER_UNAVAILABLE'},'Provider outage cannot silently select full price')
providerData.set('I-W8STM7W68EY6',saved)
sql(`insert into affiliate_checkouts(user_id,plan_id,period,affiliate_id,discount_bps,subscription_id) select '${buyer}','${normal}','monthly',id,0,'I-VWXFNFSRYKG6' from affiliate_accounts where user_id='${owner}'`)
const mismatch=await preview(2)
assert.equal(mismatch.eligibility_reason,'VERIFIED_UNPAID_PENDING');assert.equal(mismatch.discount_eligible,true)
assert.equal(mismatch.checkout_ready,false);assert.equal(mismatch.checkout_blocker,'OPEN_CHECKOUT_PLAN_MISMATCH','Eligibility is distinct from permission to reuse a conflicting checkout')
assert.equal(mismatch.selected_plan_id,intro,'Shows intended selection, but not safe to create until pending conflict reconciled')
process.env.AFFILIATE_PROGRAM_ENABLED='false'
await preview(2)
await assert.rejects(createCheckout(db,{id:buyer},request,provider),/disabled/)
assert.equal(posts.length,0,'Feature OFF allows only preview, never checkout creation')
process.env.AFFILIATE_PROGRAM_ENABLED='true'
readOnly=false
await assert.rejects(createCheckout(db,{id:buyer},request,provider),/OPEN_CHECKOUT_PLAN_MISMATCH/)
assert.equal(posts.length,0,'Never silently reuse wrong normal plan or create duplicate subscription')
// Synthetic-only removal of conflict proves actual provider selection equals preview.
sql(`delete from affiliate_checkouts where user_id='${buyer}'`)
const actual=await createCheckout(db,{id:buyer},request,provider)
assert.equal(actual.id,'I-NEWFIXTURE');assert.equal(posts.length,1);assert.equal(posts[0].plan_id,good.selected_plan_id)
for(const role of ['anon','authenticated']) assert.equal(sql(`select has_function_privilege('${role}','affiliate_checkout_selection(uuid,jsonb)','execute')::text`),'false')
console.log('PASS shared SQL+server preview/create selection, 3 pending IDs, exact 955/1061/146/809/121 cents, no/expired/self/consumed/provider-unknown cases, read-only DB/no provider POST, wrong-open-plan blocked, matching actual plan, private RPC')
