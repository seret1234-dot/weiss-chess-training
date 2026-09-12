// Actual application + real Stockfish, saved near-mate games, isolated backend transport.
// Never contacts a production account or writes production state.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { Chess } from 'chess.js'
import { runtime as r, profile, userId } from './test-weekly-assessment-dataflow.mjs'

const base = process.env.AUTO_DEMO_URL || 'http://localhost:5173'
const opening = { id: '11111111-2222-4333-8444-555555555555', slug: 'weekly-saved-italian', name: 'Italian Game', family: 'Italian Game', ply_count: 6, uci_moves: ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6'], san_moves: ['e4','e5','Nf3','Nc6','Bc4','Nf6'] }
const user = { id: userId, email: 'weekly-review@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const session = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user }
const weekKey = r.getCurrentWeekKey()
const gameRecord = (color, moves) => {
 const game = new Chess(); for (const san of moves) game.move(san)
 return { color, started: true, completed: false, pgn: game.pgn(), fen: game.fen(), result: '*', updatedAt: new Date().toISOString() }
}
const browser = await chromium.launch({ headless: true })
try {
 for (const { due, skip } of [{due:false,skip:false},{due:true,skip:false},{due:false,skip:true}]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  let cloud = { userId, weekKey, reviewFlowVersion: 1, engineElo: 3000, currentGame: 0,
   games: [gameRecord('white', ['f3','e5']), gameRecord('black', ['f3','e5','g4'])], updatedAt: new Date().toISOString() }
  const writes = [], errors = [], calls = [], autoWeights = [], visited = []
  let selectedSlot = 0, expectedSection = null
  await context.route('https://lahzgtcpbshmzsqoqswf.supabase.co/**', async route => {
   const req = route.request(), url = new URL(req.url()), path = url.pathname
   calls.push(req.method()+' '+path+'?'+url.searchParams)
   let data = [], count = 0
   if (path === '/auth/v1/user') data = user
   else if (path === '/auth/v1/token') data = session
   else if (path.endsWith('/weekly_adaptive_tests')) {
    if (['POST','PATCH'].includes(req.method())) {
     const next = req.postDataJSON()
     const expected = url.searchParams.get('updated_at')?.slice(3)
     if (!expected || expected === cloud.updatedAt) { cloud = next.state; writes.push(structuredClone(cloud)); data = { state: cloud } }
     else data = null
    } else {
     data = [{ state: cloud, updated_at: cloud.updatedAt, completed_at: cloud.completedAt, plan_signals: cloud.planSignals }]
     if (url.searchParams.get('select')?.startsWith('plan_signals')) autoWeights.push(cloud.planSignals)
    }
   } else if (path.endsWith('/profiles')) data = [{ id: userId, onboarding_complete: true }]
   else if (path.endsWith('/user_auto_profile')) data = [{ user_id: userId, ...profile }]
   else if (path.endsWith('/user_study_plan')) data = [{ user_id: userId, max_active_trainers: 3, mates_weight: 30 }]
   else if (path.endsWith('/user_curriculum_state')) data = [{ user_id: userId, seeded_from_existing_progress: true, rating_snapshot: 800 }]
   else if (path.endsWith('/user_curriculum_area_progress')) data = r.CURRICULUM_AREAS.map(area => ({ user_id: userId, area, current_stage: 1, difficulty_ceiling: 1 }))
   else if (path.endsWith('/user_curriculum_session_evidence')) count = selectedSlot
   else if (path.endsWith('/user_chunk_progress') && due) data = [{ trainer_key: 'back-rank-mate-1', chunk_index: 0, next_due_at: '2020-01-01T00:00:00Z', is_mastered: false, mastered_puzzles_count: 0 }]
   else if (path.endsWith('/next_user_opening')) data = [{ id: opening.id, slug: opening.slug }]
   else if (path.endsWith('/opening_lines')) data = [opening]
   else if (path.includes('/rpc/')) data = { tier: 'free', limit: 10, used: 0, remaining: 10, allowed: true }
   if ((req.headers().accept ?? '').includes('application/vnd.pgrst.object+json') && Array.isArray(data)) data = data[0] ?? null
   await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0,count-1)}/${count}`, 'access-control-expose-headers': 'content-range' }, body: req.method() === 'HEAD' ? '' : JSON.stringify(data) }).catch(() => {})
  })
  await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' }))
  await context.addInitScript(({ session, seed }) => {
   localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token', JSON.stringify(session))
   if (!localStorage.getItem('weiss-weekly-adaptive-test-v1')) localStorage.setItem('weiss-weekly-adaptive-test-v1', JSON.stringify(seed))
  }, { session, seed: cloud })
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message))
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) visited.push(frame.url()) })
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('weiss-weekly-adaptive-test-v1')))
  const marker = () => page.locator('[data-name="weekly-explained-review"]')
  const readyReview = () => page.locator('[data-name="weekly-explained-review"][data-ready="true"][data-saving="false"]').waitFor({ timeout: 180000 })
  const clickMove = async (from,to) => { await page.locator(`[data-square="${from}"]`).first().click(); await page.locator(`[data-square="${to}"]`).first().click() }
  const navigate = async (name, ply) => {
   await readyReview(); await page.getByRole('button', { name, exact: true }).first().click()
   await page.waitForFunction(ply => document.querySelector('[data-name="weekly-explained-review"]')?.getAttribute('data-ply') === String(ply) && document.querySelector('[data-name="weekly-explained-review"]')?.getAttribute('data-saving') === 'false', ply)
  }
  try {
   await page.goto(base+'/play-computer?weekly=1')
   await page.getByText('Ready', { exact: true }).waitFor({ timeout: 60000 })
   await page.locator('.play-computer-status-text').filter({ hasText: 'Weekly game 1 resumed' }).waitFor()
   await page.reload()
   await page.getByText('Ready', { exact: true }).waitFor({ timeout: 60000 })
   await page.locator('.play-computer-status-text').filter({ hasText: 'Weekly game 1 resumed' }).waitFor()
   assert.equal((await state()).games[0].fen, cloud.games[0].fen)
   await clickMove('g2','g4')
   await page.waitForURL(url => url.pathname === '/analyze/board' && url.searchParams.get('weeklyGame') === '1', { timeout: 60000 })
   // Refresh while analysis is unfinished, not after a fixture says it is done.
   if (!cloud.games[0].analysisSnapshot) await page.reload()
   await readyReview()
   await page.waitForFunction(()=>Number(document.querySelector('[data-name="weekly-explained-review"]')?.getAttribute('data-ply')) >= 2)
   await page.getByRole('button', { name: 'Pause playback', exact: true }).click()
   const pausedPly = await marker().getAttribute('data-ply')
   await page.waitForTimeout(4500)
   assert.equal(await marker().getAttribute('data-ply'), pausedPly, 'Pause stops real playback')
   for (const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]) {
    await page.setViewportSize(viewport)
    const geometry=await page.evaluate(()=>{
     const group=document.querySelector('.analyze-review-summary-group'),grid=document.querySelector('.analyze-review-grid');
     const boxes=[group.children[0],group.children[1],grid.children[1],grid.children[6]].map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,bottom:r.bottom}})
     const side=document.querySelector('.trainer-shell-side');
     return{boxes,overflow:document.documentElement.scrollWidth>innerWidth+1,sideScroll:side.scrollHeight>side.clientHeight+1,buttons:[...document.querySelectorAll('.analyze-move-navigation button')].filter(el=>el.getClientRects().length).map(el=>({whiteSpace:getComputedStyle(el).whiteSpace,width:el.clientWidth,scroll:el.scrollWidth}))}
    })
    assert.equal(geometry.overflow,false,JSON.stringify({viewport,geometry}))
    assert.ok(geometry.boxes.every(b=>b.x>=0&&b.x+b.width<=viewport.width+1),'all columns fit viewport: '+JSON.stringify({viewport,geometry}))
    assert.ok(geometry.buttons.every(b=>b.whiteSpace==='nowrap'&&b.scroll<=b.width),JSON.stringify(geometry.buttons))
    if(viewport.width===1920){
     const [summary,classification,details,moves]=geometry.boxes
     assert.ok(Math.abs(summary.x-details.x)<1 && Math.abs(summary.width-details.width)<1,'summary/details share first track')
     assert.ok(details.y>=summary.bottom && classification.x>summary.x && moves.x>classification.x,'stacked details + classification + moves')
     assert.equal(geometry.sideScroll,false,JSON.stringify(geometry))
    }
    console.log('PASS review geometry',viewport,geometry)
   }
   await page.setViewportSize({width:1440,height:900})
   assert.equal(cloud.games[0].analysis.status, 'complete')
   await navigate('Last', 4)
   assert.equal(await marker().getAttribute('data-reviewed'), pausedPly, 'Last cannot complete skipped review')
   assert.equal(await page.getByRole('button', {name:'Skip Review',exact:true}).count(),1)
   if (skip) {
    await page.getByRole('button', {name:'Skip Review',exact:true}).click()
   } else {
   await navigate('First', 0); await navigate('Next', 1); await navigate('Next', 2); await navigate('Prev', 1)
   const beforeRefreshWrites = writes.length
   await page.reload(); await readyReview()
   assert.equal(await marker().getAttribute('data-ply'), '1', 'Game 1 review index survives reload')
   assert.equal(writes.length, beforeRefreshWrites, 'cached analysis and review hydration are read-only')
   await navigate('Next', 2); await navigate('Next', 3)
   await page.getByRole('button', { name: 'Next', exact: true }).first().click()
   assert.equal(await marker().getAttribute('data-paused'), 'true', 'manual Next pauses playback, including the final move')
   await page.getByRole('button', { name: 'Resume playback', exact: true }).click()
   }
   await page.waitForURL('**/play-computer?weekly=1&continue=2', { timeout: 30000 })
   assert.ok(cloud.games[0].explainedReview[skip ? 'skippedAt' : 'completedAt'])
   if(skip){
    assert.equal(cloud.games[0].explainedReview.completedAt,undefined)
    assert.equal(cloud.games[0].explainedReview.furthestPly,Number(pausedPly))
   }
   assert.equal(cloud.games[1].completed, false)
   await page.getByText('Ready', { exact: true }).waitFor({ timeout: 60000 })
   await page.locator('.play-computer-status-text').filter({ hasText: 'Weekly game 2 resumed' }).waitFor()
   assert.equal(await page.getByRole('button', { name: /Start Weekly Game|Continue to Game 2/ }).count(), 0)
   const gameTwoPgn = (await state()).games[1].pgn
   await page.reload(); await page.getByText('Ready', { exact: true }).waitFor({ timeout: 60000 })
   await page.locator('.play-computer-status-text').filter({ hasText: 'Weekly game 2 resumed' }).waitFor()
   assert.equal((await state()).games[1].pgn, gameTwoPgn)
   if(skip){
    await page.goto(base+`/analyze/board?review=1&weekly=1&weeklyGame=1&weekKey=${weekKey}`)
    await page.waitForURL('**/play-computer?weekly=1&continue=2')
    await page.getByText('Ready',{exact:true}).waitFor({timeout:60000})
    await page.locator('.play-computer-status-text').filter({hasText:'Weekly game 2 resumed'}).waitFor()
   }
   await clickMove('d8','h4')
   await page.waitForURL(url => url.pathname === '/analyze/board' && url.searchParams.get('weeklyGame') === '2', { timeout: 60000 })
   if (!cloud.games[1].analysisSnapshot) await page.reload()
   await readyReview()
   await page.getByRole('button', { name: 'Pause playback', exact: true }).click()
   assert.equal(cloud.planSignals.assessment.analysisStatus, 'complete')
   assert.equal(cloud.planSignals.assessment.explainedReviewStatus, 'in_progress')
   // Choose a deterministic ordinal where this real saved assessment changes section selection.
   const plain = r.buildPersonalTrainingPlan(profile)
   const adjusted = r.buildPersonalTrainingPlan(profile, cloud.planSignals.assessment.sectionMultipliers)
   selectedSlot = Array.from({ length: 100 }, (_, i) => i).find(i => r.selectScheduledSection(plain, i).key !== r.selectScheduledSection(adjusted, i).key)
   assert.notEqual(selectedSlot, undefined, 'real analysis changes a scheduler slot')
   expectedSection = r.selectScheduledSection(adjusted, selectedSlot).key
   await navigate('First', 0); await navigate('Next', 1); await navigate('Next', 2)
   const savedWriteCount = writes.length
   await page.reload(); await readyReview()
   assert.equal(await marker().getAttribute('data-ply'), '2')
   assert.equal(writes.length, savedWriteCount, 'Game 2 refresh does not rerun/persist completed analysis')
   const beforeFinalWeights=structuredClone(cloud.planSignals.assessment.sectionMultipliers)
   if(skip){
    await page.getByRole('button',{name:'Resume playback',exact:true}).click()
    await page.waitForFunction(()=>document.querySelector('[data-name="weekly-explained-review"]')?.getAttribute('data-ply')==='3')
    await page.getByRole('button',{name:'Skip Review & Continue to Practice',exact:true}).click()
   }else{
   await page.getByRole('button', { name: 'Resume playback', exact: true }).click()
   for(const ply of [3,4]) {
    await page.waitForFunction(ply=>document.querySelector('[data-name="weekly-explained-review"]')?.getAttribute('data-ply')===String(ply),ply,{timeout:25000})
    const san=ply===3?'g4':'Qh4#'
    assert.ok((await page.locator('[aria-current="step"]').textContent()).includes(san),'autoplay selects the matching move')
    assert.ok((await page.locator('.analyze-review-grid > :nth-child(2)').textContent()).includes('Move: '+san),'autoplay displays matching Review Details')
   }
   }
   await page.waitForURL(url => !['/analyze/board','/auto','/play-computer'].includes(url.pathname), { timeout: 60000 })
    const path = new URL(page.url()).pathname
    assert.ok(!['/openings','/master-games','/mates','/tactics','/endgame-studies'].includes(path), 'completed Game 2 must enter an exercise, not a category')
    await page.locator('[data-square="e4"]').first().waitFor({ timeout: 30000 })
   assert.ok(cloud.reviewFlowCompletedAt)
   assert.equal(cloud.planSignals.assessment.explainedReviewStatus, skip ? 'skipped' : 'complete')
   assert.deepEqual(cloud.planSignals.assessment.sectionMultipliers,beforeFinalWeights,'skip/completion never changes analysis weights')
   if(skip){
    assert.ok(cloud.games.every(g=>g.explainedReview.skippedAt&&!g.explainedReview.completedAt))
    for(const i of [0,1]) assert.equal(new Set(writes.map(s=>s.games[i].explainedReview?.skippedAt).filter(Boolean)).size,1,'one durable skip per game')
   }
   assert.ok(visited.some(url => url.endsWith('/auto?continue=1')), 'existing direct Auto entry used')
   assert.ok(autoWeights.length >= 2 && autoWeights.every(s => s.assessment.analysisStatus === 'complete'), 'Auto reads current completed assessment')
   if (due) assert.equal(path, '/mates/m1/back-rank')
   else {
    const prefixes = { mates: '/mates', tactics: '/tactics', masterMates: '/master-mates', masterTactics: '/master-tactics', endgames: '/endgame', openings: '/openings', masterGames: '/master-games' }
    assert.ok(path.startsWith(prefixes[expectedSection]), `${expectedSection} expected, got ${path}`)
   }
   const completionTime = cloud.reviewFlowCompletedAt
   await page.goto(base+`/analyze/board?review=1&weekly=1&weeklyGame=2&weekKey=${weekKey}`)
   await page.waitForURL(url => !['/analyze/board','/auto','/play-computer'].includes(url.pathname), { timeout: 60000 })
   assert.equal(cloud.reviewFlowCompletedAt, completionTime, 'reopening completed review cannot complete twice or loop')
   assert.deepEqual(errors, [])
   console.log(`PASS real Game 1/2 finishes + Stockfish analysis + ${skip ? 'explicit skip' : 'ordered review'} + phase refresh + direct Auto (${due ? 'due review' : expectedSection}, slot ${selectedSlot}): ${path}; no runtime errors`)
  } catch (error) {
   console.error({ url: page.url(), text: (await page.locator('body').innerText()).slice(-5500), cloud, errors, calls: calls.slice(-12) })
   throw error
  } finally { await context.close() }
 }
} finally { await browser.close() }
