// Real production bundle/Stockfish; isolated backend records, never real accounts.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { Chess } from 'chess.js'
const server=process.env.AUTO_DEMO_URL?null:await preview({mode:'production',preview:{host:'127.0.0.1',port:0,open:false}})
const base=process.env.AUTO_DEMO_URL||server.resolvedUrls.local[0].replace(/\/$/,'')
const user={id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',email:'weekly@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const session={access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}
const monday=new Date();monday.setDate(monday.getDate()-(monday.getDay()||7)+1)
const weekKey=`${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`
const old='2026-09-01T00:00:00Z', recent='2026-09-02T00:00:00Z', future='2099-01-01T00:00:00Z'
const game=(pgn='',updatedAt=old)=>{const c=new Chess();if(pgn)c.loadPgn(pgn);return {color:'white',started:!!pgn,completed:false,pgn,fen:c.fen(),result:'*',updatedAt}}
const state=(pgn='',updatedAt=old)=>({userId:user.id,weekKey,engineElo:1500,currentGame:0,games:[game(pgn,updatedAt),{...game('',updatedAt),color:'black'}],updatedAt})
const cloudProgress=state('1. e4 e5'), localProgress=state('1. d4 d5',recent)
const complete={...state('1. e4 e5'),currentGame:2,completedAt:old,games:[{...game('1. e4 e5'),completed:true,result:'0-1'},{...game('1. d4 d5'),color:'black',completed:true,result:'1-0'}]}
const cases=[
 ['cloud in-progress, absent cache',null,cloudProgress,cloudProgress],
 ['cloud completed, absent cache',null,complete,complete],
 ['newer meaningful local',localProgress,cloudProgress,localProgress],
 ['newer meaningful cloud',cloudProgress,localProgress,localProgress],
 ['future empty local',state('',future),cloudProgress,cloudProgress],
 ['future empty cloud',localProgress,state('',future),localProgress],
 ['completed versus future empty local',state('',future),complete,complete],
]
const browser=await chromium.launch({headless:true})
try{for(const [name,local,remote,winner] of cases){
 const context=await browser.newContext({viewport:{width:1280,height:720}})
 let cloud=structuredClone(remote),release;const gate=new Promise(r=>release=r),writes=[],errors=[]
 await context.route('https://lahzgtcpbshmzsqoqswf.supabase.co/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data=[]
  if(path==='/auth/v1/user')data=user
  else if(path==='/auth/v1/token')data=session
  else if(path.endsWith('/weekly_adaptive_tests')){
   if(req.method()==='GET'){await gate;data=[{state:cloud}]}
   else{cloud=req.postDataJSON().state;writes.push(structuredClone(cloud));data={state:cloud}}
  }else if(path.endsWith('/profiles'))data=[{id:user.id,onboarding_complete:true}]
  else if(path.endsWith('/user_auto_profile'))data=[{user_id:user.id,onboarding_complete:true,current_rating:1500,daily_minutes:20}]
  else if(path.includes('/rpc/'))data={tier:'free',allowed:true,limit:2,used:0,remaining:2}
  if((req.headers().accept||'').includes('application/vnd.pgrst.object+json')&&Array.isArray(data))data=data[0]??null
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 await context.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}))
 await context.addInitScript(({session,local})=>{
  localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token',JSON.stringify(session))
  if(local&&!localStorage.getItem('weiss-weekly-adaptive-test-v1'))localStorage.setItem('weiss-weekly-adaptive-test-v1',JSON.stringify(local))
 },{session,local})
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/play-computer?weekly=1&auto=1')
 await page.getByText('Ready',{exact:true}).waitFor({timeout:60000})
 assert.equal(writes.length,0,'no write before reconciliation')
 release()
 await page.getByText('Account sync active',{exact:true}).waitFor({timeout:30000})
 const verify=async()=>{
  const stored=await page.evaluate(id=>JSON.parse(localStorage.getItem(`weiss-weekly-adaptive-test-v1:account:${id}`)),user.id)
  for(const actual of [stored,...writes]){
   assert.equal(actual.currentGame,winner.currentGame,name)
   for(let i=0;i<2;i++)for(const field of ['pgn','fen','started','completed','result'])assert.equal(actual.games[i][field],winner.games[i][field],`${name}: ${field}`)
   assert.equal(actual.completedAt,winner.completedAt)
  }
  assert.ok(writes.length>0,'selected winner persisted')
  assert.equal(new URL(page.url()).pathname,'/play-computer','no duplicate analysis started')
  assert.deepEqual(errors,[])
 }
 await verify();await page.reload();await page.getByText('Account sync active',{exact:true}).waitFor({timeout:30000});await verify()
 console.log(`PASS ${name}: exact saved games restored; only winner persisted; refresh stable, no duplicate start/analysis`)
 await context.close()
}}finally{await browser.close();await new Promise(r=>server?server.httpServer.close(r):r())}
