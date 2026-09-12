import assert from 'node:assert/strict'
import { affiliateTaxConfig } from '../server/affiliate-tax-config.mjs'
import { createCheckout, processAffiliateEvent } from '../server/affiliate-core.mjs'
import handler from '../api/affiliate.js'
import priceProfile from '../api/price-profile.js'
import { configureAffiliateTaxFixture } from './affiliate-tax-test-fixture.mjs'

const env = {}, map = configureAffiliateTaxFixture(env)
assert.deepEqual(affiliateTaxConfig(env), map)
const invalid = raw => {
  assert.throws(() => affiliateTaxConfig({...env,AFFILIATE_PAYPAL_TAX_BPS_JSON:raw}),
    e => e.code==='AFFILIATE_TAX_CONFIG_INVALID' && e.message==='AFFILIATE_TAX_CONFIG_INVALID' && !e.cause)
}
// Production-error reproduction: JS-object/unquoted property syntax at position 1.
const unquoted = env.AFFILIATE_PAYPAL_TAX_BPS_JSON.replaceAll('"','')
assert.throws(()=>JSON.parse(unquoted),/position 1/)
assert.throws(()=>affiliateTaxConfig({...env,AFFILIATE_PAYPAL_TAX_BPS_JSON:unquoted}),
  {code:'AFFILIATE_TAX_CONFIG_INVALID',reason:'MALFORMED_JSON_UNQUOTED_KEY'})
for (const raw of [undefined,'',unquoted,"{'P-MS':0}",'null','[]','42','true',JSON.stringify(env.AFFILIATE_PAYPAL_TAX_BPS_JSON)]) invalid(raw)
for (const id of Object.keys(map)) {
  const missing={...map};delete missing[id];invalid(JSON.stringify(missing))
  for (const rate of ['0',0.5,-1,10001,null,true]) invalid(JSON.stringify({...map,[id]:rate}))
  invalid(JSON.stringify({...map,[id]:map[id]===0?1800:0}))
}
invalid(JSON.stringify({...map,'P-UNKNOWN':0}))
invalid(JSON.stringify({...map,__proto__:null,constructor:0}))
assert.throws(()=>affiliateTaxConfig({...env,PAYPAL_PLAN_MONTHLY_STANDARD:env.PAYPAL_PLAN_YEARLY_STANDARD}),/AFFILIATE_TAX_CONFIG_INVALID/)

Object.assign(process.env,env,{PAYPAL_MODE:'sandbox',AFFILIATE_CHECKOUT_ORIGIN:'http://127.0.0.1:4250',AFFILIATE_PROGRAM_ENABLED:'true'})
delete process.env.PAYPAL_API_BASE_URL
process.env.AFFILIATE_PAYPAL_TAX_BPS_JSON=unquoted
let providerCalls=0,dbCalls=0
const provider=async()=>{providerCalls++;throw Error('Unexpected provider call')}
const db={from(){dbCalls++;throw Error('Unexpected DB call')},rpc(){dbCalls++;throw Error('Unexpected DB call')}}
await assert.rejects(()=>createCheckout(db,{id:'fixture'},{headers:{},body:{period:'monthly'}},provider),/AFFILIATE_TAX_CONFIG_INVALID/)
await assert.rejects(()=>processAffiliateEvent({event_type:'PAYMENT.SALE.COMPLETED',resource:{id:'SALE'}},db,provider),/AFFILIATE_TAX_CONFIG_INVALID/)
assert.equal(providerCalls,0);assert.equal(dbCalls,0)

const response=()=>({code:200,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}})
const originalFetch=globalThis.fetch, originalError=console.error, logs=[]
process.env.SUPABASE_URL='https://affiliate-test.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key'
globalThis.fetch=async url=>{
  assert.ok(String(url).endsWith('/auth/v1/user'))
  return Response.json({id:'60000000-0000-4000-8000-000000000001',aud:'authenticated'})
}
console.error=(...args)=>logs.push(args.join(' '))
try {
  const res=response()
  await handler({method:'POST',headers:{host:'weisschess.com',origin:'https://weisschess.com','content-type':'application/json',authorization:'Bearer synthetic-test-token'},body:{action:'checkout',period:'monthly'}},res)
  assert.equal(res.code,503);assert.deepEqual(res.body,{error:'AFFILIATE_TAX_CONFIG_INVALID'})
  const prices=response();priceProfile({method:'GET',headers:{}},prices)
  assert.equal(prices.code,503);assert.deepEqual(prices.body,{error:'AFFILIATE_TAX_CONFIG_INVALID'})
  assert.ok(logs.every(line=>!line.includes(unquoted)&&!line.includes('position 1')&&!line.includes('synthetic-test-token')))
  configureAffiliateTaxFixture()
  const valid=response();priceProfile({method:'GET',headers:{'x-vercel-ip-country':'IL'}},valid)
  assert.equal(valid.code,200);assert.equal(valid.body.affiliateCheckout,true)
  assert.equal(valid.body.monthlyPlanId,'P-MT')
} finally { globalThis.fetch=originalFetch;console.error=originalError }
console.log('PASS tax config: eight plans; malformed/object/missing/extra/rate/mapping checks; no DB/provider calls on failure; sanitized API 503; valid pricing preflight')
