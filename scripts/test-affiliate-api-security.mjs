import assert from 'node:assert/strict'
import handler from '../api/affiliate.js'
import { configureAffiliateTaxFixture } from './affiliate-tax-test-fixture.mjs'
const originalFetch=globalThis.fetch
process.env.SUPABASE_URL='https://affiliate-test.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service-key-not-a-credential'
const user='60000000-0000-4000-8000-000000000001', calls=[]
let previewFixture=false, providerDown=false
configureAffiliateTaxFixture()
Object.assign(process.env,{PAYPAL_MODE:'live',PAYPAL_CLIENT_ID:'fixture-client',PAYPAL_SECRET:'fixture-secret'})
globalThis.fetch=async(url,options={})=>{
 const request=String(url);calls.push({url:request,body:options.body})
 if(request.includes('/auth/v1/user'))return Response.json({id:user,email:'fixture@test.invalid',email_confirmed_at:'2026-09-07T10:00:00Z',aud:'authenticated'})
 if(previewFixture) {
  assert.ok(!request.includes('/rpc/affiliate_command'),'Read-only preview must never call mutating RPC')
  if(request.includes('/rpc/affiliate_eligibility_history')) return Response.json({ids:providerDown?['I-FIXTURE']:[],fingerprint:'fixture',blocked:false})
  if(request.includes('/rpc/affiliate_checkout_selection')) {
   const input=JSON.parse(options.body)
   assert.equal(input.p_actor,user,'Authenticated identity, not supplied actor')
   assert.notEqual(input.p_data.history_proof.fingerprint,'forged','Client proof ignored')
   return Response.json({eligible:!providerDown,can_create:true,reason:providerDown?'PROVIDER_UNAVAILABLE':'ELIGIBLE',plan_id:providerDown?'P-MT':'P-INTRO-MT',attribution_present:true,affiliate_code:'fixture',affiliate_id:'fixture',rate_bps:1500})
  }
  if(request.endsWith('/v1/oauth2/token')) return Response.json({access_token:'fixture-token'})
  if(request.includes('/v1/billing/subscriptions/')) {assert.equal(options.method,'GET');return Response.json({name:'SERVICE_UNAVAILABLE'},{status:503})}
  if(request.includes('/v1/billing/plans/')) {
   assert.equal(providerDown,false,'No fallback plan GET after unresolved eligibility')
   const cycle={tenure_type:'REGULAR',sequence:1,total_cycles:0,frequency:{interval_unit:'MONTH',interval_count:1},pricing_scheme:{fixed_price:{currency_code:'USD',value:'10.61'}}}
   return Response.json({id:request.split('/').at(-1),status:'ACTIVE',product_id:'FIXTURE',billing_cycles:request.endsWith('P-MT')?[cycle]:[{...cycle,tenure_type:'TRIAL',total_cycles:1,pricing_scheme:{fixed_price:{currency_code:'USD',value:'9.55'}}},{...cycle,sequence:2}]})
  }
  throw Error('Unexpected read-only preview request')
 }
 if(request.includes('/rpc/affiliate_command'))return Response.json({valid:true,account:null})
 throw Error(`Unexpected external request: ${request}`)
}
async function request(body,extra={}){
 const res={headers:{},code:200,setHeader(k,v){this.headers[k]=v},status(v){this.code=v;return this},json(data){this.data=data;return this}}
 await handler({method:'POST',headers:{host:'weisschess.com',origin:'https://weisschess.com','content-type':'application/json',...extra.headers},body,...(extra.method?{method:extra.method,query:body}:{})},res)
 return res
}
try {
 process.env.AFFILIATE_PROGRAM_ENABLED='false'
 assert.equal((await request({action:'activate'})).code,503)
 assert.equal((await request({action:'checkout'},{headers:{authorization:'Bearer fixture-access-token'}})).code,503)
 assert.equal((await request({action:'checkout_preview',period:'monthly'})).code,503,'OFF preview is no longer a diagnostic bypass')
 assert.equal((await request({action:'checkout_preview',period:'monthly'},{headers:{origin:'https://evil.invalid'}})).code,503)
 process.env.AFFILIATE_PROGRAM_ENABLED='true'
 assert.equal((await request({action:'activate'},{headers:{origin:'https://evil.invalid'}})).code,403)
 assert.equal((await request({action:'activate'},{headers:{'content-type':'text/plain'}})).code,415)
 assert.equal((await request({action:'dashboard'})).code,401)
 assert.equal((await request({action:'checkout_preview',period:'monthly'})).code,401)
 assert.equal((await request({action:'checkout_preview',period:'monthly'},{headers:{origin:'https://evil.invalid'}})).code,403)
 assert.equal((await request({action:'manage'},{method:'GET'})).code,405)
 const tracked=await request({action:'track',code:'fixture-coach',destination:'/mates?chunk=25#puzzle',p_actor:'spoofed'})
 assert.equal(tracked.code,200);assert.match(tracked.headers['Set-Cookie'],/Max-Age=2592000; HttpOnly; SameSite=Lax; Secure/)
 assert.equal((await request({action:'track',code:'fixture-coach',destination:'https://evil.invalid'})).code,400)
 await request({action:'dashboard',p_actor:'spoofed',user_id:'spoofed'},{headers:{authorization:'Bearer fixture-access-token'}})
 const rpc=JSON.parse(calls.filter(x=>x.url.includes('/rpc/')).at(-1).body)
 assert.equal(rpc.p_actor,user)
 assert.equal((await request({action:'close_checkout',id:'spoofed'},{headers:{authorization:'Bearer fixture-access-token'}})).code,400)
 previewFixture=true
 process.env.AFFILIATE_PROGRAM_ENABLED='false'
 const previewBody={action:'checkout_preview',period:'monthly',p_actor:'spoofed',history_proof:{fingerprint:'forged',ids:['I-FORGED']}}
 const authHeaders={headers:{authorization:'Bearer fixture-access-token','x-vercel-ip-country':'IL'}}
 assert.equal((await request(previewBody,authHeaders)).code,503)
 process.env.AFFILIATE_PROGRAM_ENABLED='true'
 const enabledPreview=await request(previewBody,authHeaders)
 assert.equal(enabledPreview.code,200);assert.equal(enabledPreview.data.selected_plan_id,'P-INTRO-MT')
 assert.equal(enabledPreview.data.first_amount_cents,955)
 providerDown=true
 for(const flag of ['false','true']) {
  process.env.AFFILIATE_PROGRAM_ENABLED=flag
  const unavailable=await request(previewBody,authHeaders)
  assert.equal(unavailable.code,503)
  if(flag==='true') {
   assert.equal(unavailable.data.error,'AFFILIATE_ELIGIBILITY_UNAVAILABLE')
   assert.match(unavailable.data.message,/temporarily unavailable/)
  }
  assert.equal(unavailable.data.selected_plan_id,undefined)
 }
 console.log('PASS API gates: disabled default, CSRF/content type, authenticated identity, private dashboard, mutation methods, first-party cookie, internal destination validation, no browser-accessible internal checkout-close operation')
} finally {globalThis.fetch=originalFetch}
