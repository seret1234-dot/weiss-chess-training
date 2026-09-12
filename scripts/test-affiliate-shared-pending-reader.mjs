import assert from 'node:assert/strict'
import { checkoutHistoryProof } from '../server/affiliate-eligibility.mjs'
import { pendingPayPalReader } from '../server/affiliate-pending-paypal-read.mjs'
const oldFetch=globalThis.fetch
Object.assign(process.env,{PAYPAL_MODE:'live',PAYPAL_CLIENT_ID:'fixture-client',PAYPAL_SECRET:'PRIVATE_FIXTURE_SECRET'})
delete process.env.PAYPAL_API_BASE_URL
const ids=['I-EYRP06UKJ430','I-VWXFNFSRYKG6','I-W8STM7W68EY6'], user='90000000-0000-4000-8000-000000000001'
const plans=new Map([['P-M','monthly'],['P-Y','yearly']])
const created=new Date(Date.now()-3600000).toISOString()
const db={rpc:async(name,args)=>{assert.equal(name,'affiliate_eligibility_history');assert.equal(args.p_actor,user);return{data:{ids,fingerprint:'fixture',blocked:false}}}}
let calls=[],broken=null
globalThis.fetch=async(input,options={})=>{
 const url=new URL(input);calls.push({path:url.pathname,method:options.method})
 assert.equal(url.origin,'https://api-m.paypal.com')
 if(url.pathname==='/v1/oauth2/token') return Response.json({access_token:'PRIVATE_FIXTURE_TOKEN'})
 assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.ok(options.signal)
 assert.ok(!url.pathname.includes('transactions'),'Classifier must never request unavailable pending transactions')
 const id=url.pathname.split('/').at(-1);assert.ok(ids.includes(id))
 if(id===broken) return Response.json({name:'RESOURCE_NOT_FOUND',details:[{issue:'INVALID_RESOURCE_ID',description:'PRIVATE_FIXTURE_SECRET'}],debug_id:'abcdef0123456',message:'PRIVATE_FIXTURE_SECRET'},{status:404})
 const yearly=id===ids[2]
 return Response.json({id,plan_id:yearly?'P-Y':'P-M',custom_id:`${user}|${yearly?'yearly':'monthly'}`,status:'APPROVAL_PENDING',create_time:created})
}
try {
 const good=await checkoutHistoryProof(db,user,plans)
 assert.equal(good.reason,'VERIFIED_UNPAID_PENDING');assert.deepEqual(good.ids,ids)
 assert.equal(calls.filter(c=>c.path==='/v1/oauth2/token').length,1,'One OAuth token per complete multi-ID verification')
 assert.equal(calls.filter(c=>c.method==='GET').length,6,'Two detail GETs for every object')
 assert.ok(good.diagnostics.every(d=>d.http_status===200&&d.oauth_succeeded))
 broken=ids[0];calls=[]
 const unknown=await checkoutHistoryProof(db,user,plans)
 assert.equal(unknown.reason,'PROVIDER_UNAVAILABLE');assert.equal(unknown.verifications.length,3,'No early return hides other objects')
 assert.deepEqual(unknown.ids,ids.slice(1))
 assert.equal(unknown.verifications[0].diagnostic.http_status,404)
 assert.equal(unknown.verifications[0].diagnostic.paypal_issue_codes[0],'INVALID_RESOURCE_ID')
 assert.ok(!JSON.stringify(unknown).includes('PRIVATE_FIXTURE'))
 const reader=pendingPayPalReader([],ids)
 await assert.rejects(reader('/v1/billing/subscriptions/I-OTHER'),/rejected/)
 await assert.rejects(reader(`/v1/billing/subscriptions/${ids[0]}/transactions?start_time=1&end_time=2`),/rejected/)
 await assert.rejects(reader('https://evil.invalid/'),/rejected/)
 console.log('PASS shared production detail reader: all 3 IDs, 6 GETs, single OAuth, no transactions, 404 details fail closed, per-object sanitized diagnostics, no private data or writes')
} finally {globalThis.fetch=oldFetch}
