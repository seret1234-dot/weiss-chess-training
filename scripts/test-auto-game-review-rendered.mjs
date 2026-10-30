// Production bundle, real chess/Stockfish; isolated HTTP only, never real accounts.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview } from 'vite'
const server=await preview({preview:{host:'127.0.0.1',port:0}}),base=server.resolvedUrls.local[0].replace(/\/$/,'')
const browser=await chromium.launch({headless:true})
const scenarios=[...[{width:390,height:844},{width:360,height:800},{width:844,height:390},{width:1920,height:1080}].map(viewport=>({viewport,kind:'learner-mate'})),...['computer-mate','resign','transfer'].map(kind=>({viewport:{width:390,height:844},kind}))]
try { for(const {viewport,kind} of scenarios.filter(s=>!process.env.AUTO_REVIEW_CASE||s.kind===process.env.AUTO_REVIEW_CASE)) {
 const context=await browser.newContext({viewport,isMobile:viewport.width<768,hasTouch:viewport.width<768})
 const user={id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',email:'auto-review@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
 const session={access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}
 const monday=new Date();monday.setDate(monday.getDate()-(monday.getDay()||7)+1)
 const weekKey=`${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`
 const completedWeekly={userId:user.id,weekKey,currentGame:2,completedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),games:[{color:'white',completed:true,started:true,result:'1-0'},{color:'black',completed:true,started:true,result:'0-1'}]}
 const writes=[],errors=[],routes=[]
 await context.route('**/*.supabase.co/**',async r=>{
  const q=r.request(),path=new URL(q.url()).pathname;let data=[]
  if(['PUT','POST','PATCH','DELETE'].includes(q.method()))writes.push({path,body:q.postDataJSON()})
  if(path==='/auth/v1/user')data=user
  else if(path==='/auth/v1/token')data=session
  else if(path.endsWith('/user_auto_profile'))data=[{user_id:user.id,onboarding_complete:true,estimated_rating:800,daily_minutes:20}]
  else if(path.endsWith('/profiles'))data=[{id:user.id,study_mode:'auto'}]
  else if(path.endsWith('/weekly_adaptive_tests'))data=[{state:completedWeekly}]
  else if(path.endsWith('/user_study_plan'))data=[{user_id:user.id,max_active_trainers:3,mates_weight:30}]
  else if(path.endsWith('/user_curriculum_state'))data=[{user_id:user.id,seeded_from_existing_progress:true,rating_snapshot:800}]
  else if(path.endsWith('/user_curriculum_area_progress'))data=['mates','tactics','endgame-piece-mates','endgame-studies','board-vision','openings','master-games'].map(area=>({user_id:user.id,area,current_stage:1,difficulty_ceiling:1}))
  else if(path.includes('/rpc/'))data={tier:'free',daily_limit:2,used_today:0,limit:2,used:0,remaining:2,allowed:true,admitted:true}
  if((q.headers().accept||'').includes('application/vnd.pgrst.object+json')&&Array.isArray(data))data=data[0]??null
  await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 await context.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}))
 await context.addInitScript(s=>{if(!localStorage.getItem('sb-lahzgtcpbshmzsqoqswf-auth-token'))localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token',JSON.stringify(s))},session)
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('framenavigated',f=>{if(f===p.mainFrame())routes.push(f.url())})
 const marker=()=>p.locator('[data-name="weekly-explained-review"]')
 const readRecord=()=>p.evaluate(({id,userId})=>JSON.parse(localStorage.getItem(`weiss-auto-game-review-v1:${id}:account:${userId}`)),{id:new URL(p.url()).searchParams.get('autoReview'),userId:user.id})
 try {
  const fen=kind==='computer-mate'?'8/8/8/8/8/5kq1/8/7K b - - 0 1':'7k/8/5KQ1/8/8/8/8/8 w - - 0 1'
  if(kind==='transfer') await context.addInitScript(({userId,fen})=>{
   const key=`weiss-endgame-transfer-session-v1:account:${userId}`
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({userId,sessionId:'isolated-transfer',id:'kqk-fixture',trainerKey:'kqk-basic',theme:'kqk',trainerTitle:'Queen mate',sourceRoute:'/endgame/piece-mates/kqk',label:'Mate',fen,studentColor:'white',expectedResult:'mate',objective:'Deliver mate',engineElo:1500,sourceTrainedAt:new Date().toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'ready'}))
  },{userId:user.id,fen})
  await p.goto(base+'/play-computer?auto=1'+(kind==='transfer'?'&endgameTransfer=1':kind==='resign'?'':'&fen='+encodeURIComponent(fen)+'&color=white'))
  if(kind!=='computer-mate') {
  await p.locator('span').filter({hasText:/^Ready$/}).waitFor({timeout:60000})
  const entry=p.url(),documentStart=await p.evaluate(()=>performance.timeOrigin)
  if(viewport.width>768)await p.getByRole('button',{name:'Menu',exact:true}).hover()
  await p.getByRole('button',{name:'Play',exact:true}).click()
  assert.equal(p.url(),entry);assert.equal(await p.evaluate(()=>performance.timeOrigin),documentStart)
  for(const square of kind==='resign'?['e2','e4']:['g6','g7']) {const target=p.locator(`[data-square="${square}"]`).first();if(viewport.width<768)await target.tap();else await target.click()}
  if(kind==='resign') {
   await p.waitForFunction(id=>{const value=JSON.parse(sessionStorage.getItem(`weiss-play-computer-session-v1:auto:account:${id}`)||'null');return value?.pgn.includes('e4')&&value.fen.split(' ')[1]==='w'},user.id,{timeout:60000})
   await p.getByRole('button',{name:'Resign',exact:true}).click()
  }
  }
  await p.waitForURL(u=>u.pathname==='/analyze/board'&&u.searchParams.has('autoReview'),{timeout:30000})
  const reviewUrl=p.url(),recordBefore=await readRecord();assert.equal(recordBefore.result,['resign','computer-mate'].includes(kind)?'0-1':'1-0');if(['learner-mate','transfer'].includes(kind))assert(recordBefore.pgn.includes('Qg7#'))
  if(viewport.width===390)await p.reload() // interrupted analysis safely resumes from the saved completed game
  await p.locator('[data-name="weekly-explained-review"][data-ready="true"]').waitFor({timeout:180000})
  await p.getByRole('button',{name:'Pause playback',exact:true}).click()
  assert((await readRecord()).snapshot)
  const snapshot=JSON.stringify((await readRecord()).snapshot),ply=await marker().getAttribute('data-ply')
  await p.reload();await p.locator('[data-name="weekly-explained-review"][data-ready="true"]').waitFor({timeout:60000})
  assert.equal(await marker().getAttribute('data-ply'),ply);assert.equal(JSON.stringify((await readRecord()).snapshot),snapshot)
  assert.equal(await marker().getAttribute('data-paused'),'true')
  const duration=Number(await marker().getAttribute('data-reading-ms'));assert(duration>=4000&&duration<=18000)
  if(viewport.width===1920)await p.getByRole('button',{name:'Resume playback',exact:true}).click()
  else await p.getByRole('button',{name:'Skip Review & Continue to Practice',exact:true}).click()
  await p.waitForURL(u=>!['/analyze/board','/auto','/play-computer'].includes(u.pathname),{timeout:90000})
  await p.locator('[data-square]').first().waitFor({timeout:60000})
  assert(routes.some(u=>u.endsWith('/auto?continue=1')))
  assert(!['/mates','/tactics','/openings','/endgames','/master-games','/onboarding'].includes(new URL(p.url()).pathname))
  assert.equal(writes.filter(w=>w.path.endsWith('/weekly_adaptive_tests')).length,0,'non-Weekly game must not write Weekly evidence')
  const id=new URL(reviewUrl).searchParams.get('autoReview')
  const terminal=await p.evaluate(({id,userId})=>JSON.parse(localStorage.getItem(`weiss-auto-game-review-v1:${id}:account:${userId}`)).explainedReview,{id,userId:user.id})
  assert(terminal[viewport.width===1920?'completedAt':'skippedAt']);assert(!terminal[viewport.width===1920?'skippedAt':'completedAt'])
  assert.deepEqual(errors,[])
  console.log('PASS Auto playable -> completed game -> saved result -> Stockfish -> shared explained playback -> refresh/resume -> skip/natural completion -> concrete Auto',viewport,kind)
 } catch(e) { console.error({viewport,kind,url:p.url(),errors,record:await readRecord().catch(()=>null),text:(await p.locator('body').innerText()).slice(-1800)});throw e }
 finally {await context.close()}
}} finally {await browser.close();await server.close()}
