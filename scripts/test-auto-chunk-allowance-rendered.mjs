import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { readFile } from 'node:fs/promises'
import { Chess } from 'chess.js'
import { runtime as r, profile, userId, stateFor } from './test-weekly-assessment-dataflow.mjs'
const server=process.env.QUOTA_TEST_BASE ? null : await preview({mode:'production',build:{outDir:'dist'},preview:{host:'127.0.0.1',port:4240,strictPort:true}})
const base=process.env.QUOTA_TEST_BASE || 'http://127.0.0.1:4240'
const opening={id:'11111111-2222-4333-8444-555555555555',slug:'quota-italian',name:'Italian Game',family:'Italian Game',family_slug:'italian',eco:'C50',ply_count:6,uci_moves:['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6'],san_moves:['e4','e5','Nf3','Nc6','Bc4','Nf6']}
const game={id:731,slug:'quota-model',white:'White',black:'Black',result:'*',pgn_storage_key:'quota-fixture.pgn',pgn:'[White "White"]\n[Black "Black"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *'}
const user={id:userId,email:'quota-fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const session={access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user}
const browser=await chromium.launch({headless:true})
async function setup(){
 const context=await browser.newContext({viewport:{width:1440,height:900}})
 const state={used:0,premium:false,unlocks:new Set(),calls:[],oldUsage:0,oldStatus:0}
 await context.route('https://lahzgtcpbshmzsqoqswf.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname
  if(path.endsWith('/quota-fixture.pgn'))return route.fulfill({status:200,contentType:'text/plain',body:game.pgn})
  if(path.includes('/storage/'))return route.continue()
  let data=[],count=0
  if(path==='/auth/v1/user')data=user
  else if(path==='/auth/v1/token')data=session
  else if(path.endsWith('/profiles'))data=[{id:userId,onboarding_complete:true}]
  else if(path.endsWith('/user_auto_profile'))data=[{user_id:userId,...profile}]
  else if(path.endsWith('/weekly_adaptive_tests'))data=[{state:stateFor(),completed_at:new Date().toISOString(),plan_signals:null}]
  else if(path.endsWith('/user_curriculum_state'))data=[{user_id:userId,seeded_from_existing_progress:true,rating_snapshot:800}]
  else if(path.endsWith('/user_curriculum_area_progress'))data=r.CURRICULUM_AREAS.map(area=>({user_id:userId,area,current_stage:1,difficulty_ceiling:1}))
  else if(path.endsWith('/opening_lines'))data=[opening]
  else if(path.endsWith('/master_games'))data=[game]
  else if(path.endsWith('/claim_auto_training_chunk')){
    const unit=req.postDataJSON(),key=JSON.stringify([unit.p_course,unit.p_trainer_key,unit.p_unit_key]);state.calls.push(unit)
    const known=state.unlocks.has(key),allowed=state.premium||known||state.used<2
    if(allowed&&!known){state.unlocks.add(key);if(!state.premium)state.used++}
    data={allowed,tier:state.premium?'premium':'free',used:state.used,remaining:Math.max(0,2-state.used),limit:2}
  }
  else if(path.endsWith('/reserve_training_item_usage')){state.oldUsage++;data={tier:'free',used:10,remaining:0,limit:10}}
  else if(path.endsWith('/get_training_item_usage_status')){state.oldStatus++;data={tier:'free',used:10,remaining:0,limit:10}}
  else if(path.includes('/rpc/'))data={tier:'free',used:10,remaining:0,limit:10,allowed:false} // old item cap MUST NOT gate admitted Auto
  if((req.headers().accept??'').includes('application/vnd.pgrst.object+json')&&Array.isArray(data))data=data[0]??null
  await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':`0-0/${count}`,'access-control-expose-headers':'content-range'},body:req.method()==='HEAD'?'':JSON.stringify(data)})
 })
 await context.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}))
 await context.addInitScript(s=>localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token',JSON.stringify(s)),session)
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 return {context,page,state,errors}
}
try {
 // Direct/manual routes must not resurrect the old 10-item gate, even when
 // historical guest storage and the retired server ledger both say exhausted.
 for(const signedIn of [true,false]){
  const {context,page,state,errors}=await setup()
  try{
   await context.addInitScript(signed=>{
    if(!signed)localStorage.removeItem('sb-lahzgtcpbshmzsqoqswf-auth-token')
    localStorage.setItem('weiss-training-guest-usage-v1','10')
   },signedIn)
   for(const path of ['/mates/m1/kill-box','/mates/m1/back-rank','/tactics/m1/bishop-fork','/master-mates/1/back-rank','/master-tactics/1/hanging-piece','/endgame/piece-mates/kqk','/board-vision','/openings/quota-italian','/master-games/quota-model']){
    await page.goto(base+path)
    if(path.endsWith('kill-box'))await page.getByText('Queen Fence',{exact:false}).first().waitFor({timeout:45000})
    else await page.locator('[data-square="e4"]').first().waitFor({timeout:45000})
    await page.evaluate(()=>{for(let i=0;i<35;i++)window.dispatchEvent(new CustomEvent('weiss:training-item-completed',{detail:{kind:'puzzle',itemKey:'legacy-regression-'+i,eventId:crypto.randomUUID()}}))})
    assert.doesNotMatch(await page.locator('body').innerText(),/10 free training items|free allowance resets/)
    assert.equal(state.oldStatus,0);assert.equal(state.oldUsage,0);assert.equal(state.calls.length,0)
   }
   assert.deepEqual(errors,[])
   console.log('PASS all direct trainer families, historical exhausted '+(signedIn?'Free':'guest')+' count ignored; zero retired RPC calls')
  }finally{await context.close()}
 }
 // Complete TWO real 30-puzzle chunks from zero progress, five qualifying
 // mouse solves per puzzle. Only performance.now is controlled for timing;
 // positions, moves, thresholds, handlers, completion and admission are real.
 {
  const {context,page,state,errors}=await setup()
  try{
   await context.addInitScript(()=>Object.defineProperty(performance,'now',{value:()=>1000,configurable:true}))
   // This scenario isolates quota across two complete chunks. The real Auto
   // handoff is covered separately by test-due-review-commit-rendered with
   // TEST_AUTO_COMPLETION=1; keep the completed quota fixture visible here.
   await context.addInitScript(()=>window.addEventListener('weissChess:auto-training-complete',event=>event.stopImmediatePropagation(),{capture:true}))
   for(const chunk of [0,1]){
    const data=JSON.parse(await readFile(`public/data/full-curricula-v1/pattern-mates/back-rank/mate-in-1/chunk-${String(chunk+1).padStart(3,'0')}.json`,'utf8'))
    const puzzles=data.puzzles??data;assert.equal(puzzles.length,30)
    // Begin each newly requested fixture chunk at its first puzzle, retaining
    // every earned solve in prior chunks. This is not a progress/quota reset.
    if(chunk>0)await page.evaluate(chunk=>{
     const key='pattern_mate_progress_back-rank-mate-1:full-precut-v1_v1'
     const saved=JSON.parse(localStorage.getItem(key)||'{}')
     localStorage.setItem(key,JSON.stringify({...saved,currentChunkIndex:chunk,currentPuzzleIndex:0}))
    },chunk)
    await page.goto(base+`/mates/m1/back-rank?auto=1&chunk=${chunk}`)
    await expectPoll(()=>state.used===chunk+1)
    for(let attempt=0;attempt<150;attempt++){
     const p=puzzles[attempt%30],game=new Chess(p.fen)
     if(p.preMove)game.move(p.preMove)
     const pieces=Object.fromEntries(game.board().flat().filter(Boolean).map(p=>[p.square,p.color+p.type.toUpperCase()]))
     await page.waitForFunction(expected=>Object.entries(expected).every(([sq,p])=>document.querySelector(`[data-square="${sq}"] [data-piece="${p}"]`)),pieces)
     await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Silent error'&&!b.disabled))
     const uci=p.solutionLine?.[0]??p.solution
     await page.getByRole('button',{name:'Next Puzzle',exact:true}).waitFor({timeout:45000})
     await page.locator(`[data-square="${uci.slice(0,2)}"]`).first().click()
     await page.locator(`[data-square="${uci.slice(2,4)}"]`).first().click()
     await page.getByText('Correct',{exact:true}).first().waitFor()
     assert.equal(state.used,chunk+1)
     assert.equal(state.oldUsage,0)
     if(attempt<149)await page.getByRole('button',{name:'Next Puzzle',exact:true}).click()
    }
    await page.getByText('30 / 30 puzzles completed at 5/5',{exact:true}).waitFor({timeout:45000})
    assert.equal(state.used,chunk+1)
    console.log(`PASS full 30-puzzle chunk ${chunk+1}: 150 qualifying solves, exactly ${state.used}/2 ledger units, no item cap`)
   }
   await page.goto(base+'/mates/m1/back-rank?auto=1&chunk=2')
   await page.getByTestId('auto-chunk-limit').waitFor({timeout:45000})
   assert.equal(state.used,2)
   await page.goto(base+'/mates/m1/back-rank?auto=1&chunk=0')
   await page.locator('[data-square="e4"]').first().waitFor({timeout:45000})
   assert.equal(await page.getByTestId('auto-chunk-limit').count(),0)
   assert.equal(state.used,2);assert.equal(state.oldStatus,0);assert.deepEqual(errors,[])
   console.log('PASS third new chunk blocked, existing full chunk reopens at 2/2')
  }catch(e){console.error({used:state.used,calls:state.calls,text:(await page.locator('body').innerText()).slice(-2500),errors});throw e}
  finally{await context.close()}
 }
 const cases=[['/board-vision?auto=1&chunk=0','vision'],['/openings/quota-italian?auto=1','openings'],['/tactics/m1/bishop-fork?auto=1','pattern'],['/master-tactics/1/hanging-piece?auto=1','pattern'],['/endgame/piece-mates/kqk?auto=1','endgame'],['/master-mates/1/back-rank?auto=1','pattern'],['/master-games/quota-model?auto=1','master_games'],['/mates/m1/back-rank?auto=1','pattern']]
 for(const [route,course]of cases){
  const {context,page,state,errors}=await setup()
  try {
   await page.goto(base+route)
   await page.waitForFunction(()=>document.querySelector('[data-square="e4"]'))
   await expectPoll(()=>state.calls.length>0)
   assert.equal(state.calls[0].p_course,course);assert.equal(state.used,1)
   if(course==='openings'||course==='master_games')assert.equal(state.calls[0].p_unit_key,'1-1','count existing stage, not entire game')
   await page.reload();await expectPoll(()=>state.calls.length>=2);assert.equal(state.used,1,'refresh does not spend again')
   state.used=2
   await page.reload();await expectPoll(()=>state.calls.length>=3);assert.equal(await page.getByTestId('auto-chunk-limit').count(),0,'unlocked/review remains playable at cap')
   state.unlocks.clear()
   await page.reload();await page.getByText("Today's free training is complete.",{exact:true}).waitFor({timeout:45000})
   assert.equal(await page.locator('[data-square="e4"]').count(),0,'new trainer never activated at cap')
   assert.ok((await page.locator('body').innerText()).includes('Come back tomorrow, or upgrade to Premium to continue now.'))
   state.premium=true
   await page.reload();await page.locator('[data-square="e4"]').first().waitFor({timeout:45000})
   await expectPoll(()=>state.unlocks.size>0);assert.equal(state.used,2,'Premium does not spend')
   assert.equal(state.oldUsage,0);assert.equal(state.oldStatus,0);assert.deepEqual(errors,[])
   console.log('PASS rendered admission/refresh/unlocked/cap/Premium: '+route)
  } catch(e){console.error({route,calls:state.calls,text:(await page.locator('body').innerText()).slice(-1800),errors});throw e}
  finally{await context.close()}
 }
 // Existing stage completion, not route navigation, must gate the next unit.
 for(const route of ['/openings/quota-italian?auto=1','/master-games/quota-model?auto=1']){
  const {context,page,state}=await setup()
  try {
   state.used=1 // this starts today's SECOND new unit
   await page.goto(base+route);await expectPoll(()=>state.used===2)
   await page.locator('[data-square="e2"]').first().waitFor()
   for(let run=0;run<5;run++){
    await page.waitForFunction(()=>document.querySelector('[data-square="e2"] [data-piece="wP"]'))
    for(const [from,to]of [['e2','e4'],['e7','e5']]){
     await page.locator(`[data-square="${from}"]`).first().click()
     await page.locator(`[data-square="${to}"]`).first().click()
    }
    if(run<4)await page.waitForFunction(()=>document.querySelector('[data-square="e2"] [data-piece="wP"]'))
   }
   await page.getByTestId('auto-chunk-limit').waitFor({timeout:45000})
   assert.equal(state.used,2)
   assert.equal(state.calls.at(-1).p_unit_key,'1-2','next stage checked AFTER all five runs of admitted stage')
   assert.equal(state.oldUsage,0,'old item count cannot interrupt the admitted stage')
   console.log('PASS rendered second unit finishes cleanly; next internal stage blocked: '+route)
  }finally{await context.close()}
 }
 // Cross-section shared allowance and a second tab use the same account ledger.
 const {context,page,state}=await setup()
 try {
  await page.goto(base+'/openings/quota-italian?auto=1');await expectPoll(()=>state.used===1)
  const second=await context.newPage();await second.goto(base+'/master-games/quota-model?auto=1');await expectPoll(()=>state.used===2)
  await page.reload();await expectPoll(()=>state.calls.length>=3);assert.equal(state.used,2)
  await second.goto(base+'/mates/m1/back-rank?auto=1');await second.getByTestId('auto-chunk-limit').waitFor({timeout:45000})
  const before=state.calls.length
  await page.goto(base+'/home');await page.getByText('Analyze',{exact:true}).first().waitFor({timeout:45000})
  assert.equal(state.calls.length,before,'Home does not charge')
  console.log('PASS rendered global 1 Opening + 1 Master Game, multi-tab, third chunk blocked, Home excluded')
 }finally{await context.close()}
 if(process.env.TEST_EXISTING_AUTO==='1'){
  process.env.AUTO_DEMO_URL=base
  await import('./test-auto-playable-rendered.mjs')
  await import('./test-weekly-assessment-auto-rendered.mjs')
 }
}finally{await browser.close();if(server)await new Promise(r=>server.httpServer.close(r))}
async function expectPoll(test){const end=Date.now()+45000;while(!test()){if(Date.now()>end)throw Error('Timed out waiting for admission');await new Promise(r=>setTimeout(r,50))}}
