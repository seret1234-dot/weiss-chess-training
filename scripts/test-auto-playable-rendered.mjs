// Full local application and router; isolated backend, no real-account writes.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { runtime as r, profile, userId, stateFor } from './test-weekly-assessment-dataflow.mjs'

const base = process.env.AUTO_DEMO_URL || 'http://localhost:5173'
const plan = r.buildPersonalTrainingPlan(profile)
const opening = {id:'11111111-2222-4333-8444-555555555555',slug:'auto-test-italian',name:'Italian Game',family:'Italian Game',family_slug:'italian',eco:'C50',ply_count:6,uci_moves:['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6'],san_moves:['e4','e5','Nf3','Nc6','Bc4','Nf6']}
const game = {id:731,slug:'auto-test-model',title:'Auto model game',white:'White',black:'Black',result:'*',opening:'Italian Game',pgn_storage_key:'auto-test.pgn'}
const pgn = '[White "White"]\n[Black "Black"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *'
const user = { id:userId,email:'auto-playable@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{} }
const session = {access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user}
const browser = await chromium.launch({headless:true})
try {
  for (const key of ['boardVision','openings','tactics','masterTactics','endgames','masterMates','masterGames','empty-openings','mastered-openings','mastered-masterGames','partial-masterTactics','partial-masterMates','unlocked-masterTactics','unlocked-masterMates']) {
    const desired = key === 'empty-openings' ? 'openings' : key.replace(/^(mastered|unlocked|partial)-/,'')
    const slot = Array.from({length:2000},(_,i)=>i).find(i=>r.selectScheduledSection(plan,i).key===desired)
    assert.notEqual(slot,undefined)
    const context = await browser.newContext({viewport:{width:1440,height:900}})
    const unlocked=[]
    if(key.startsWith('unlocked-') || key.startsWith('partial-')) {
      const mates=desired==='masterMates'
      // Seed existing component mastery only, never Mixed itself.
      const catalog=JSON.parse(await readFile(mates?'public/data/master-puzzles/v1/indexes/mates-theme-catalog.json':'public/data/master-puzzles/v1/catalog.json','utf8'))
      for(const depth of [1,2,3,4]) {
      const counts=mates?catalog.distances[String(depth)]:catalog.tactics[String(depth)].themes
      const required=r.CURRICULUM_CATALOG.filter(item=>item.available&&item.area===(mates?'mates':'tactics')&&item.variantLevel===depth&&!item.isMixed).map(item=>item.route.split('/').slice(3).join('-')).filter(theme=>counts[theme]>0)
      const missing=key.startsWith('partial-')?required.at(-1):null
      for(const [theme,count] of Object.entries(counts)) if(theme!=='mixed'&&theme!==missing) for(let i=1;i<=Math.ceil(count/30);i++) unlocked.push({trainer_key:`master-${mates?'mates':'tactics'}:${depth}:${theme}`,chunk_index:i,is_mastered:true,next_review_at:'2099-01-01T00:00:00Z'})
      }
    }
    const errors=[], visited=[]
    await context.route('https://lahzgtcpbshmzsqoqswf.supabase.co/**',async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname
      if (path.includes('/storage/v1/object/public/master-games-pgn/auto-test.pgn')) return route.fulfill({status:200,contentType:'text/plain',body:pgn})
      if (path.includes('/storage/')) return route.continue()
      let data=[],count=0
      if(path==='/auth/v1/user') data=user
      else if(path==='/auth/v1/token') data=session
      else if(path.endsWith('/profiles')) data=[{id:userId,onboarding_complete:true}]
      else if(path.endsWith('/user_auto_profile')) data=[{user_id:userId,...profile}]
      else if(path.endsWith('/user_study_plan')) data=[{user_id:userId,max_active_trainers:3,mates_weight:30}]
      else if(path.endsWith('/weekly_adaptive_tests')) data=[{state:stateFor(),completed_at:new Date().toISOString(),plan_signals:null}]
      else if(path.endsWith('/user_curriculum_state')) data=[{user_id:userId,seeded_from_existing_progress:true,rating_snapshot:800}]
      else if(path.endsWith('/user_curriculum_area_progress')) data=r.CURRICULUM_AREAS.map(area=>({user_id:userId,area,current_stage:1,difficulty_ceiling:1}))
      else if(path.endsWith('/user_curriculum_session_evidence')) count=slot
      else if(path.endsWith('/user_chunk_progress')) data=unlocked.slice(Number(url.searchParams.get('offset')??0), Number(url.searchParams.get('offset')??0)+Number(url.searchParams.get('limit')??1000))
      else if(path.endsWith('/next_user_opening')) data=key==='empty-openings'?[]:[{id:opening.id,slug:opening.slug}]
      else if(path.endsWith('/next_user_master_game')) data=[{id:game.id,slug:game.slug}]
      else if(path.endsWith('/opening_lines')) data=[opening]
      else if(path.endsWith('/master_games')) data=[game]
      else if(path.endsWith('/training_progress') && key.startsWith('mastered-') && url.searchParams.get('select')?.includes('item_id')) {
        data=['1-1','1-2','1-3','1-3-full'].map(item_id=>({item_id,mastery:5,next_review_at:'2099-01-01T00:00:00Z'}))
      }
      else if(path.includes('/rpc/')) data={tier:'free',limit:10,used:0,remaining:10,allowed:true}
      if((req.headers().accept??'').includes('application/vnd.pgrst.object+json')&&Array.isArray(data)) data=data[0]??null
      await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':`0-${Math.max(0,count-1)}/${count}`,'access-control-expose-headers':'content-range'},body:req.method()==='HEAD'?'':JSON.stringify(data)})
    })
    await context.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}))
    await context.addInitScript(session=>localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token',JSON.stringify(session)),session)
    const page=await context.newPage()
    page.on('pageerror',e=>errors.push(e.message))
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())visited.push(new URL(frame.url()).pathname)})
    try {
      if(desired==='masterTactics'||desired==='masterMates') {
        await page.goto(base+'/tactics/m1/bishop-fork?auto=1')
        await page.getByTestId('finish-drill-continue').click()
        await page.waitForURL(url=>url.pathname.startsWith(desired==='masterTactics'?'/master-tactics/':'/master-mates/'),{timeout:45000})
      } else await page.goto(base+'/auto?continue=1')
      await page.waitForURL(url=>!['/auto','/'].includes(url.pathname),{timeout:45000})
      const path=new URL(page.url()).pathname
      const expected={boardVision:'/board-vision',openings:'/openings/auto-test-italian',masterGames:'/master-games/auto-test-model',masterMates:'/master-mates/',masterTactics:'/master-tactics/',endgames:'/endgame/',tactics:'/mates/','empty-openings':'/board-vision'}
      // The existing curriculum can choose either a normal Mate or Tactic in the Tactics section.
      assert.ok(key.startsWith('mastered-') ? /^\/(board-vision|mates|tactics|endgame)(\/|$)/.test(path) : key==='tactics'?/^\/(mates|tactics)\/m\d\//.test(path):path.startsWith(expected[key]??expected[desired]),`${key}: ${path}`)
      if(desired==='masterTactics'||desired==='masterMates') assert.equal(path.endsWith('/mixed'),key.startsWith('unlocked-'),'Finish Drill requires component mastery before Mixed')
      await page.locator('[data-square="e4"]').first().waitFor({timeout:45000})
      if (key==='openings'||key==='masterGames') {
        await page.getByText(key==='openings'?'Play the opening moves exactly.':'Play the game moves exactly.',{exact:true}).waitFor()
        // Board markup precedes the asynchronous account allowance/progress
        // check. Hint is exposed only when this stage is actually playable.
        await page.getByRole('button',{name:'Hint',exact:true}).first().waitFor()
        await page.locator('[data-square="e2"]').first().click()
        await page.locator('[data-square="e4"]').first().click()
        await page.waitForFunction(()=>[...document.querySelectorAll('[role="group"]')].some(el=>/Current move: Ply [1-9]/.test(el.textContent)))
      }
      if(path==='/board-vision') await page.getByText(/^AUTO review:/).waitFor()
      assert.equal(await page.getByText('Opening Auto Training…',{exact:true}).count(),0)
      const text=await page.locator('body').innerText()
      assert.ok(text.length>30,'actual trainer content mounted')
      assert.ok(!visited.some(p=>['/openings','/master-games','/mates','/tactics','/endgames','/endgame-studies'].includes(p)),'never navigate via a library')
      assert.deepEqual(errors,[])
      console.log(`PASS rendered ${key}, slot ${slot}: ${path}; real board and trainer mounted`)
    } catch(error) {
      console.error({key,url:page.url(),errors,text:(await page.locator('body').innerText()).slice(-3500)})
      throw error
    } finally {await context.close()}
  }
} finally {await browser.close()}
