import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview } from 'vite'
const realTag=process.argv.includes('--real-tag')
const server=await preview({mode:'production',preview:{host:'127.0.0.1',port:0,open:false}})
const base=server.resolvedUrls.local[0].replace(/\/$/,'')
const id='G-RLHDSPZ8WH', consentKey='weiss-analytics-consent-v1'
const browser=await chromium.launch({headless:true})
// Deterministic transport fixture verifies the adapter, not Google's stream settings.
// --real-tag loads Google's actual tag; collection requests are inspected/aborted
// so synthetic test visits never reach the real reporting property.
const tag=`(()=>{const q=window.dataLayer;function run(a){if(a[0]==='event'){const p=new URLSearchParams({tid:a[2].send_to,en:a[1]});for(const[k,v]of Object.entries(a[2]))p.set(k,String(v));fetch('https://www.google-analytics.com/g/collect?'+p,{method:'POST',mode:'no-cors'}).catch(()=>{})}}q.forEach(run);const push=q.push.bind(q);q.push=function(a){const n=push(a);run(a);return n}})()`
async function setup({consent=false,blocked=false,signedIn=false}={}){
 const context=await browser.newContext({viewport:{width:1280,height:720}}),sent=[],errors=[],scripts=[]
 // Observe installations per document, independently of network retries/helper
 // requests. A refresh creates a new document; SPA navigation must not reinstall.
 await context.addInitScript(measurementId=>{
  const matches=n=>n.nodeType===1&&n.tagName==='SCRIPT'&&(()=>{
   try{const u=new URL(n.src);return u.hostname==='www.googletagmanager.com'&&u.pathname==='/gtag/js'&&u.searchParams.get('id')===measurementId}catch{return false}
  })()
  window.__gaTagInstallations=0
  new MutationObserver(records=>{
   for(const record of records)for(const node of record.addedNodes)if(matches(node))window.__gaTagInstallations++
  }).observe(document,{childList:true,subtree:true})
 },id)
 if(consent)await context.addInitScript(key=>localStorage.setItem(key,JSON.stringify({value:'granted',at:Date.now()})),consentKey)
 if(signedIn){
  // Actual production app/auth SDK, isolated backend fixture only. Never use a
  // real account or transmit its identifiers to Google during regression tests.
  const user={id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',email:'PRIVATE-ACCOUNT@example.test',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{username:'PRIVATE-USERNAME'}}
  const session={access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user}
  await context.addInitScript(value=>localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token',JSON.stringify(value)),session)
  await context.route('https://lahzgtcpbshmzsqoqswf.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname
   let data=[]
   if(path==='/auth/v1/user')data=user
   else if(path==='/auth/v1/token')data=session
   else if(path.endsWith('/user_auto_profile'))data=[{user_id:user.id,onboarding_complete:true,current_rating:1200,daily_minutes:20,target_rating:1500}]
   else if(path.endsWith('/profiles'))data=[{id:user.id,study_mode:'auto',onboarding_complete:true}]
   else if(path.endsWith('/user_study_plan'))data=[{user_id:user.id,max_active_trainers:3,mates_weight:30}]
   else if(path.endsWith('/weekly_adaptive_tests'))data=[{state:{weekKey:url.searchParams.get('week_key')?.replace(/^eq\./,''),currentGame:2,games:[{completed:true},{completed:true}],completedAt:new Date().toISOString()}}]
   else if(path.endsWith('/user_chunk_progress'))data=[{trainer_key:'back-rank-mate-1',chunk_index:0,next_due_at:'2020-01-01T00:00:00.000Z',is_mastered:false,mastered_puzzles_count:0}]
   else if(path.includes('/rpc/'))data={tier:'free',limit:2,used:0,remaining:2,allowed:true}
   if((req.headers().accept||'').includes('application/vnd.pgrst.object+json')&&Array.isArray(data))data=data[0]??null
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
  })
  await context.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:false,affiliateCheckout:false})}))
 }
 await context.route('https://www.googletagmanager.com/**',r=>{scripts.push(r.request().url());return blocked?r.abort():realTag?r.continue():r.fulfill({status:200,contentType:'application/javascript',headers:{'cross-origin-resource-policy':'cross-origin'},body:tag})})
 await context.route(/https:\/\/[^/]*(?:google-analytics\.com|analytics\.google\.com|doubleclick\.net)\//,r=>{
  const req=r.request()
  // Google's real transport batches events as separate POST-body lines. Inspect
  // every event, not only an en= parameter in the request URL.
  for(const row of (req.postData()||'').split('\n'))sent.push(req.url()+(row?'&'+row:''))
  return r.abort()
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 return{context,page,sent,errors,scripts}
}
const views=sent=>sent.filter(s=>new URL(s).searchParams.get('en')==='page_view')
async function oneInstallation(page){
 const state=await page.evaluate(measurementId=>({
  installations:window.__gaTagInstallations,
  active:[...document.scripts].filter(n=>{try{const u=new URL(n.src);return u.hostname==='www.googletagmanager.com'&&u.pathname==='/gtag/js'&&u.searchParams.get('id')===measurementId}catch{return false}}).length,
 }),id)
 assert.deepEqual(state,{installations:1,active:1},'one GA tag installation and active element per document')
}
async function settled(page){await page.getByRole('button',{name:'Menu',exact:true}).waitFor();await page.waitForTimeout(realTag?6500:250)}
async function navigate(page,path){await page.evaluate(path=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'))},path);await settled(page)}
try{
 const a=await setup();await a.page.goto(base+'/privacy');await settled(a.page)
 assert.equal(a.scripts.length,0);assert.equal(a.sent.length,0,'unknown consent produces no Google request')
 await a.page.getByRole('button',{name:'No analytics',exact:true}).click();await settled(a.page);assert.equal(a.scripts.length,0)
 await a.page.getByRole('button',{name:'Allow analytics',exact:true}).click();await settled(a.page)
 await oneInstallation(a.page);assert.ok(a.scripts.some(url=>new URL(url).searchParams.get('id')===id));assert.equal(views(a.sent).length,1,'opt-in sends current page only')
 await a.page.getByRole('button',{name:'No analytics',exact:true}).click();const deniedCount=a.sent.length
 await navigate(a.page,'/home');assert.equal(a.sent.length,deniedCount,'withdrawal blocks further events')
 await navigate(a.page,'/privacy');assert.equal(a.sent.length,deniedCount)
 await a.page.getByRole('button',{name:'Allow analytics',exact:true}).click();await settled(a.page)
 await oneInstallation(a.page);assert.equal(views(a.sent).length,2,'re-enabling consent sends only the current page, without reinstalling')
 console.log('Tag request diagnostics',JSON.stringify(a.scripts))
 assert.deepEqual(a.errors,[]);await a.context.close();console.log('PASS default deny, explicit opt-in, no pre-consent replay, withdrawal/re-enable without reinstall')

 const b=await setup({consent:true});await b.page.goto(base);await settled(b.page)
 assert.equal(views(b.sent).length,1,'exactly one initial page_view')
 await oneInstallation(b.page)
 for(const path of ['/home','/manual','/mates/m1/back-rank']){
  const count=views(b.sent).length;await navigate(b.page,path);assert.equal(views(b.sent).length,count+1,`${path}: ${JSON.stringify(b.sent.map(s=>({event:new URL(s).searchParams.get('en'),location:new URL(s).searchParams.get('dl')||new URL(s).searchParams.get('page_location')})))}`)
  await oneInstallation(b.page)
 }
 await oneInstallation(b.page)
 const before=views(b.sent).length;await b.page.goBack();await settled(b.page);await b.page.goForward();await settled(b.page)
 assert.equal(views(b.sent).length,before+2,'back/forward each count once')
 await oneInstallation(b.page)
 const beforeRefresh=views(b.sent).length;await b.page.reload();await settled(b.page);assert.equal(views(b.sent).length,beforeRefresh+1)
 await oneInstallation(b.page)
 await navigate(b.page,'/manual?email=private%40example.invalid&code=SECRET&weekKey=2026-09-07#access_token=SECRET')
 const after=views(b.sent).length;await navigate(b.page,'/manual?email=other%40example.invalid#token=OTHER');assert.equal(views(b.sent).length,after,'query/hash-only changes ignored')
 await navigate(b.page,'/openings/private-user-123?username=SECRET')
 const dynamicCount=views(b.sent).length;await navigate(b.page,'/openings/private-user-456')
 assert.equal(views(b.sent).length,dynamicCount+1,'distinct activities still count when their sanitized reporting paths match')
 await b.page.evaluate(()=>window.dispatchEvent(new CustomEvent('weiss:training-item-completed',{detail:{kind:'SECRET',email:'SECRET',pgn:'SECRET'}})))
 await settled(b.page)
 assert.equal(b.sent.filter(s=>new URL(s).searchParams.get('en')==='training_session_completed').length,1)
 for(const request of b.sent){assert.ok(request.includes(id));assert.doesNotMatch(decodeURIComponent(request),/SECRET|private@|other@|private-user-|weekKey|access_token/)}
 assert.deepEqual(b.errors,[]);console.log('PASS initial/SPA/back/forward/refresh pageviews once; identifiers stripped; bridge event once')
 console.log(JSON.stringify({mode:realTag?'REAL Google tag (collection intercepted)':'deterministic transport',scripts:b.scripts.length,pageviews:views(b.sent).length,requests:b.sent.length,sample:views(b.sent).slice(0,2)}))
 await b.context.close()

 const c=await setup({consent:true,blocked:true});await c.page.goto(base+'/manual');await settled(c.page)
 await navigate(c.page,'/home');assert.deepEqual(c.errors,[]);await oneInstallation(c.page);assert.equal(c.sent.length,0)
 await c.context.close();console.log('PASS blocked Google tag does not break navigation')

 const d=await setup({consent:true,signedIn:true});await d.page.goto(base)
 await d.page.waitForURL('**/mates/m1/back-rank?**',{timeout:30000});await settled(d.page)
 await d.page.locator('[data-square="e4"]').first().waitFor()
 const starting=views(d.sent).length
 await navigate(d.page,'/home');assert.equal(views(d.sent).length,starting+1)
 await navigate(d.page,'/manual');assert.equal(views(d.sent).length,starting+2)
 await oneInstallation(d.page)
 for(const request of d.sent)assert.doesNotMatch(decodeURIComponent(request),/PRIVATE-ACCOUNT|PRIVATE-USERNAME|aaaaaaaa-bbbb|fixture-access|fixture-refresh/)
 assert.deepEqual(d.errors,[]);await d.context.close();console.log('PASS signed-in production Auto entry/Home/Manual; account identifiers absent from collection')
}finally{await browser.close();await new Promise(r=>server.httpServer.close(r))}
