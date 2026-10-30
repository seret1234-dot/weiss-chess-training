// Isolated rendered app + deterministic backend, followed separately by the
// authorized real-account/backend verification. No live credentials or writes.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { preview } from 'vite'
import { chromium } from 'playwright'
import { Chess } from 'chess.js'
import { createChunkCompletionGate } from '../src/trainers/chunkCompletionGate.ts'

const gate=createChunkCompletionGate(),key='user:course:0'
const stale=gate.begin(),fresh=gate.begin()
assert.equal(gate.ready(stale,key),false)
assert.equal(gate.qualifiedSolve(key),false)
assert.equal(gate.ready(fresh,key),true)
assert.equal(gate.canCommit(key,[5,5],5),false,'hydration is never evidence')
gate.qualifiedSolve(key)
assert.equal(gate.canCommit(key,[5,4],5),false,'all existing criteria still required')
assert.equal(gate.canCommit(key,[5,5],5),true)
gate.begin()
assert.equal(gate.canCommit(key,[5,5],5),false,'reload/navigation invalidates old evidence')
gate.ready(gate.begin(),key,false)
assert.equal(gate.canCommit(key,[5,5],5),true,'ordinary non-review completed-progress recovery is preserved after hydration')
console.log('PASS stale hydration, no evidence, incomplete completion, qualifying completion, navigation isolation')

const autoCompletion=process.env.TEST_AUTO_COMPLETION==='1'
const root=process.cwd(),json=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'))
const cases=[]
for(const [route,chunk,key]of [
 ['/mates/m1/back-rank','/data/full-curricula-v1/pattern-mates/back-rank/mate-in-1/chunk-001.json','back-rank-mate-1:full-precut-v1'],
 ['/tactics/m1/bishop-fork','/data/full-curricula-v1/pattern-tactics/bishop-fork/m1/chunk-001.json','tactic-bishop-fork-m1:m1-full-precut-v1'],
]){
 const data=await json('public'+chunk),puzzle=(Array.isArray(data)?data:data.puzzles)[0]
 cases.push({route,key,puzzle,moves:puzzle.solutionLine??[puzzle.solution],overrides:new Map([[chunk,Array.isArray(data)?[puzzle]:{...data,puzzles:[puzzle]}]])})
}
for(const [route,index,key]of [
 ['/master-mates/1/smothered','mates-theme-1-smothered.json','master-mates:1:smothered'],
 ['/master-tactics/2/bishop-fork','tactics-course-2-bishop-fork.json','master-tactics:2:bishop-fork'],
]){
 const data=await json('public/data/master-puzzles/v1/indexes/'+index),ref=data.refs[0]
 const shard='puzzles/chunk-'+String(ref.chunk).padStart(5,'0')+'.json'
 const raw=await json('public/data/master-puzzles/v1/'+shard),puzzle=raw.puzzles.find(p=>p.id===ref.id)
 cases.push({route,key,puzzle,moves:puzzle.solution.filter(m=>m.side==='learner').map(m=>m.uci),overrides:new Map([
  ['/data/master-puzzles/v1/indexes/'+index,{...data,refs:[ref]}],
  ['/data/master-puzzles/v1/'+shard,raw],
 ])})
}
const server=process.env.REVIEW_TEST_BASE?null:await preview({preview:{host:'127.0.0.1',port:0,strictPort:true}})
const base=process.env.REVIEW_TEST_BASE||server.resolvedUrls.local[0].replace(/\/$/,'')
const browser=await chromium.launch({headless:true})
const uid='11111111-1111-4111-8111-111111111111',user={id:uid,email:'review@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const session={access_token:'fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}
try{
 for(const c of cases){
  const context=await browser.newContext({viewport:{width:1920,height:1080}}),writes=[],errors=[]
  let row={user_id:uid,trainer_key:c.key,chunk_index:1,is_mastered:true,review_stage:1,next_review_at:'2020-01-01T00:00:00Z',mastered_at:'2019-01-01T00:00:00Z',mastered_puzzles_count:1},reads=0
  const original=JSON.stringify(row)
  await context.addInitScript(({s,key})=>{
   localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token',JSON.stringify(s))
   const storageKey=`pattern_${key.startsWith('tactic-')||key.startsWith('master-tactics:')?'tactic':'mate'}_progress_${key}_v1`
   if(!localStorage.getItem(storageKey)) localStorage.setItem(storageKey,JSON.stringify({currentChunkIndex:0,currentPuzzleIndex:0,chunkProgressByFile:{'chunk-001.json':[5],'master-mates-course-0001.json':[5],'master-tactics-course-0001.json':[5]}}))
   window.reviewClock=0;Object.defineProperty(performance,'now',{value:()=>window.reviewClock,configurable:true})
  },{s:session,key:c.key})
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname
   const local=p.includes('/storage/v1/object/public/master-puzzles/v1/v1/')?'/data/master-puzzles/v1/'+p.split('/storage/v1/object/public/master-puzzles/v1/v1/')[1]:p
   if(c.overrides.has(local))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(c.overrides.get(local))})
   if(p.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'})
   if(!url.hostname.endsWith('.supabase.co')||p.includes('/storage/'))return route.continue()
   let data=[]
   if(p==='/auth/v1/user')data=user
   else if(p==='/auth/v1/token')data=session
   else if(p.endsWith('/profiles'))data=[{id:uid,onboarding_complete:true}]
   else if(p.endsWith('/user_auto_profile'))data=[{user_id:uid,onboarding_complete:true,manual_current_rating:1200,current_rating:1200,daily_minutes:20,target_rating:1500}]
   else if(p.endsWith('/weekly_adaptive_tests'))data=[{state:{weekKey:url.searchParams.get('week_key')?.replace(/^eq\./,''),currentGame:2,games:[{completed:true},{completed:true}],completedAt:new Date().toISOString()}}]
   else if(p.endsWith('/user_chunk_progress')){
    if(req.method()==='GET'){
     const trainer=url.searchParams.get('trainer_key')
     const matching=trainer==='eq.'+c.key||!trainer
     data=trainer ? (matching?[row]:[]) : [row,{trainer_key:c.route.includes('/tactics/')?'back-rank-mate-1':'tactic-bishop-fork-m1',chunk_index:1,next_due_at:'2020-01-01T00:00:00Z',is_mastered:true,mastered_puzzles_count:30}]
     if(matching){reads++;await new Promise(r=>setTimeout(r,350))}
    }else{
     const payload=req.postDataJSON();writes.push(payload)
     if(payload.chunk_index===1)row={...row,...payload}
    }
   }else if(p.endsWith('/training_progress'))data=[{item_id:c.puzzle.localId??c.puzzle.id,mastery:5}]
   else if(p.endsWith('/claim_auto_training_chunk'))data={allowed:true,tier:'free',used:2,remaining:0,limit:2}
   else if(p.includes('/rpc/'))data={allowed:true,tier:'premium',used:0,remaining:100,limit:100}
   if((req.headers().accept??'').includes('application/vnd.pgrst.object+json')&&Array.isArray(data))data=data[0]??null
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
  })
  const page=await context.newPage(),routes=[];page.on('pageerror',e=>errors.push(e.message));page.on('framenavigated',f=>{if(f===page.mainFrame())routes.push(f.url())})
  const ready=async()=>{
   await page.getByText(/4 \/ 5 fast solves/).waitFor({timeout:60000})
   await page.waitForTimeout(2200) // covers setup and delayed hydration, clock remains 0
  }
  const path=base+c.route+(autoCompletion?'?auto=1&chunk=0':'?chunk=0')
  try{
   await page.goto(path);await ready();assert.equal(await page.getByTestId('finish-drill-continue').count(),0);assert.ok(reads>0);assert.equal(JSON.stringify(row),original);assert.deepEqual(writes,[])
   await page.reload();await ready();assert.equal(JSON.stringify(row),original);assert.deepEqual(writes,[])
   await page.goto(base+'/home');await page.goto(path);await ready();assert.deepEqual(writes,[])
   // Silent error and an otherwise correct solution are NOT successful review evidence.
   await page.getByRole('button',{name:'Silent error',exact:true}).click()
   const solve=async()=>{
    for(const uci of c.moves){
     await page.waitForFunction(from=>!!document.querySelector('[data-square="'+from+'"] [data-piece]'),uci.slice(0,2))
     await page.evaluate(()=>window.reviewClock+=100)
     await page.locator('[data-square="'+uci.slice(0,2)+'"]').first().click()
     await page.locator('[data-square="'+uci.slice(2,4)+'"]').first().click()
     if(c.moves.length>1)await page.waitForTimeout(1200)
    }
   }
   await solve();await page.waitForTimeout(2600);assert.deepEqual(writes,[])
   // Reload restores the existing review criteria: one additional qualifying
   // solve of each puzzle, not credit from loading the mastered snapshot.
   await page.reload();await ready();await solve()
   await page.waitForFunction(()=>document.body.innerText.includes('5 / 5 fast solves'))
   await page.waitForTimeout(1700)
   const completions=writes.filter(x=>x.chunk_index===1&&x.is_mastered===true)
   assert.equal(completions.length,1);assert.equal(completions[0].review_stage,2)
   assert.ok(Date.parse(completions[0].next_review_at)>Date.now())
   if(autoCompletion){
    await page.waitForURL(u=>u.pathname!==c.route&&u.pathname!='/auto'&&u.searchParams.get('auto')==='1',{timeout:45000})
    await page.locator('[data-square="e4"]').first().waitFor({timeout:45000})
    assert(routes.some(u=>new URL(u).pathname==='/auto'),'completion uses canonical resolver')
    assert.equal(await page.getByTestId('finish-drill-continue').count(),0)
    assert.doesNotMatch(await page.locator('body').innerText(),/Opening next item|Finish drill & continue/)
    console.log('PASS saved genuine completion → resolver → playable trainer without click: '+c.route+' → '+new URL(page.url()).pathname)
   }else{assert.equal(new URL(page.url()).pathname,c.route,'Manual remains manual');await page.reload();await page.waitForTimeout(4000)}
   assert.equal(writes.filter(x=>x.chunk_index===1&&x.is_mastered===true).length,1)
   assert.deepEqual(errors,[])
   console.log('PASS rendered '+c.route+': open/setup/refresh/return/failed attempt no scheduling writes; qualifying completion advances once; reload no duplicate')
  }catch(e){console.error({route:c.route,writes,row,text:(await page.locator('body').innerText()).slice(0,3000),errors});throw e}
  finally{await context.close()}
 }
}finally{await browser.close();if(server)await new Promise(r=>server.httpServer.close(r))}
