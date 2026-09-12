import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'
import {authenticateUser} from '../server/image-to-position-core.mjs'
const vite=await createServer({server:{middlewareMode:true},appType:'custom'})
try{
 const {subscriptionIsPremium}=await vite.ssrLoadModule('/src/services/subscription.ts')
 const future=new Date(Date.now()+86400000).toISOString(),past=new Date(Date.now()-86400000).toISOString()
 assert.equal(subscriptionIsPremium(null),false)
 for(const status of ['active','trialing','inactive','cancelled','expired','past_due'])for(const provider of ['paypal','manual'])for(const expiry of [future,past,null,'invalid']){
  const expected=['active','trialing'].includes(status)&&(expiry===future||(expiry===null&&provider==='manual'))
  assert.equal(subscriptionIsPremium({status,provider,current_period_end:expiry}),expected)
 }
 await assert.rejects(authenticateUser({},''),e=>e.status===401&&e.message==='Log in to use Image to Position.','existing Image auth behavior unchanged')
 const user={id:'verified-user'}
 assert.equal(await authenticateUser({auth:{getUser:async token=>{assert.equal(token,'test-token');return{data:{user},error:null}}}},'Bearer test-token'),user)
 const migration=await readFile('supabase/migrations/20260909171217_chess_voice_quota.sql','utf8')
 assert.doesNotMatch(migration,/alter\s+table\s+public\.(subscriptions|image|coach)|(?:insert\s+into|update|delete\s+from)\s+public\.subscriptions|create\s+or\s+replace/i)
 assert.match(migration,/security invoker/)
 console.log('PASS existing Premium helper matrix (48 cases), Image authentication defaults, dedicated migration leaves existing subscriptions/Image/Coach objects unchanged')
}finally{await vite.close()}
