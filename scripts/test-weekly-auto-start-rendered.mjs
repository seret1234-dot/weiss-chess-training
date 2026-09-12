// Real application, board, interactive Stockfish, analysis and continuation UI.
// Only backend account/persistence HTTP is isolated; no live user data is written.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { Chess } from 'chess.js'
const base = process.env.AUTO_DEMO_URL || 'http://localhost:5173'
const user = {id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',email:'weekly@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}
const session = {access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}
const monday = new Date(); monday.setDate(monday.getDate()-(monday.getDay()||7)+1)
const weekKey = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`
const empty = color => ({color,started:false,completed:false,pgn:'',fen:new Chess().fen(),result:'*',updatedAt:new Date().toISOString()})
const fresh = () => ({userId:user.id,weekKey,engineElo:3000,currentGame:0,games:[empty('white'),empty('black')],updatedAt:new Date().toISOString()})
const browser = await chromium.launch({headless:true})
async function setup(seed) {
  const context = await browser.newContext({viewport:{width:1440,height:900}})
  let cloud = structuredClone(seed), release
  const hydration = new Promise(r=>release=r)
  const writes=[], errors=[]
  await context.route('https://lahzgtcpbshmzsqoqswf.supabase.co/**',async route=>{
    const req=route.request(), path=new URL(req.url()).pathname
    let data=[]
    if(path==='/auth/v1/user') data=user
    else if(path==='/auth/v1/token') data=session
    else if(path.endsWith('/weekly_adaptive_tests')) {
      if(req.method()==='GET'){await hydration;data=[{state:cloud,updated_at:cloud.updatedAt}]}
      else {cloud=req.postDataJSON().state;writes.push(structuredClone(cloud));data={state:cloud}}
    } else if(path.endsWith('/profiles')) data=[{id:user.id,onboarding_complete:true}]
    else if(path.endsWith('/user_auto_profile')) data=[{user_id:user.id,onboarding_complete:true,current_rating:1500,manual_current_rating:1500,daily_minutes:20}]
    else if(path.includes('/rpc/')) data={tier:'free',limit:10,used:0,remaining:10,allowed:true}
    if((req.headers().accept||'').includes('application/vnd.pgrst.object+json')&&Array.isArray(data))data=data[0]??null
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
  })
  await context.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}))
  await context.addInitScript(({session,seed})=>{
    localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token',JSON.stringify(session))
    if(!localStorage.getItem('weiss-weekly-adaptive-test-v1'))localStorage.setItem('weiss-weekly-adaptive-test-v1',JSON.stringify(seed))
  },{session,seed})
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  return {context,page,writes,errors,release:()=>release()}
}
const state = page=>page.evaluate(()=>JSON.parse(localStorage.getItem('weiss-weekly-adaptive-test-v1')))
async function move(page,from,to){await page.locator(`[data-square="${from}"]`).first().click();await page.locator(`[data-square="${to}"]`).first().click()}
async function noStart(page){assert.equal(await page.getByRole('button',{name:/Start Weekly Game/}).count(),0)}
try {
  // Engine readiness alone must not start or accept a move before hydration.
  const a=await setup(fresh());await a.page.goto(base+'/play-computer?weekly=1')
  await a.page.locator('[data-square="e2"]').first().waitFor()
  await a.page.getByText('Ready',{exact:true}).waitFor({timeout:60000})
  await move(a.page,'e2','e4');assert.equal((await state(a.page)).games[0].started,false)
  assert.equal(a.writes.length,0);await noStart(a.page)
  a.release()
  await a.page.waitForFunction(()=>JSON.parse(localStorage.getItem('weiss-weekly-adaptive-test-v1')).games[0].started)
  assert.equal((await state(a.page)).games[0].pgn.includes('1.'),false,'auto-start does not play for White')
  await move(a.page,'e2','e4')
  await a.page.waitForFunction(()=>JSON.parse(localStorage.getItem('weiss-weekly-adaptive-test-v1')).games[0].pgn.includes('e4'))
  console.log('PASS Game 1 auto-start; engine-before-hydration input locked; real learner move accepted')
  assert.deepEqual(a.errors,[]);await a.context.close()

  // Resume immediately before a real checkmate, then follow real analysis UI.
  const seed=fresh(), game=new Chess();game.move('f3');game.move('e5')
  seed.games[0]={...seed.games[0],started:true,pgn:game.pgn(),fen:game.fen()}
  const b=await setup(seed);await b.page.goto(base+'/play-computer?weekly=1')
  await b.page.locator('[data-square="g2"]').first().waitFor()
  await move(b.page,'g2','g4');assert.equal((await state(b.page)).games[0].fen,game.fen(),'resumed board also locked during hydration')
  b.release();await b.page.locator('.play-computer-status-text').filter({hasText:'Weekly game 1 resumed'}).waitFor()
  await b.page.getByText('Ready',{exact:true}).waitFor({timeout:60000})
  assert.equal((await state(b.page)).games[0].fen,game.fen(),'resume preserves saved moves')
  await move(b.page,'g2','g4')
  await b.page.waitForURL(url => url.pathname === '/analyze/board' && url.searchParams.get('weeklyGame') === '1',{timeout:60000})
  assert.equal((await state(b.page)).games[0].completed,true)
  await b.page.locator('[data-name="weekly-explained-review"][data-ready="true"]').waitFor({timeout:180000})
  assert.equal((await state(b.page)).games[0].analysis.status,'complete','real engine review persisted before explained review')
  assert.equal((await state(b.page)).planSignals.assessment.analysisStatus,'pending','Game 1 analysis does not mark both reviews complete')
  assert.equal(await b.page.getByRole('button',{name:'Continue to Weekly Game 2',exact:true}).count(),0)
  // The completed real engine review now plays every move without a Next click.
  await b.page.waitForURL('**/play-computer?weekly=1&continue=2',{timeout:120000})
  await b.page.waitForFunction(()=>JSON.parse(localStorage.getItem('weiss-weekly-adaptive-test-v1')).games[1].started,{timeout:60000})
  await noStart(b.page)
  await b.page.waitForFunction(()=>JSON.parse(localStorage.getItem('weiss-weekly-adaptive-test-v1')).games[1].pgn.includes('1.'),{timeout:60000})
  const before=await state(b.page), restored=new Chess();restored.loadPgn(before.games[1].pgn)
  assert.equal(restored.history().length,1,'Game 2 computer plays White; no automatic learner move')
  assert.equal(restored.turn(),'b');assert.equal(before.engineElo,3000)
  await b.page.reload();await b.page.locator('.play-computer-status-text').filter({hasText:'Weekly game 2 resumed'}).waitFor({timeout:60000})
  await b.page.getByText('Ready',{exact:true}).waitFor({timeout:60000})
  assert.equal((await state(b.page)).games[1].fen,before.games[1].fen,'refresh never restarts Game 2')
  assert.equal((await state(b.page)).games[1].pgn,before.games[1].pgn,'no duplicate opening move')
  const legal=restored.moves({verbose:true})[0];await move(b.page,legal.from,legal.to)
  await b.page.waitForFunction(pgn=>JSON.parse(localStorage.getItem('weiss-weekly-adaptive-test-v1')).games[1].pgn!==pgn,before.games[1].pgn)
  assert.deepEqual(b.errors,[])
  console.log('PASS saved Game 1 → mate → real analysis → ordered explained review → automatic Game 2 → refresh/resume → learner move; no runtime errors')
  await b.context.close()
} finally {await browser.close()}
