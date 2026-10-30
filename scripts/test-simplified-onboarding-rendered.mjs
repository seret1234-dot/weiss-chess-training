// Actual production bundle, Supabase SDK, router, import pipeline, background
// provider and Auto resolver. HTTP fixtures are isolated; no real account writes.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { mkdir } from 'node:fs/promises'
await mkdir('node_modules/.cache/onboarding-verification', { recursive: true })
const server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false } })
const base = server.resolvedUrls.local[0].replace(/\/$/, '')
const browser = await chromium.launch({ headless: true })
const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const introKey = 'training_introduction_v1'
const chessGame = { uuid: 'onboarding-fixture', url: 'https://www.chess.com/game/live/1',
 time_class: 'rapid', time_control: '600', end_time: 1700000000,
 white: { username: 'Tester', rating: 900, result: 'win' }, black: { username: 'Opponent', rating: 910, result: 'resigned' },
 pgn: '[White "Tester"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0' }
const lichessGame = { id: 'intro-lichess', moves: 'd4 d5 Nf3 Nc6', variant: 'standard', status: 'resign', winner: 'white', speed: 'rapid',
 clock: { initial: 600, increment: 0 }, createdAt: 1699999900000, lastMoveAt: 1700000000000,
 players: { white: { user: { name: 'Tester' }, rating: 900 }, black: { user: { name: 'Opponent' }, rating: 910 } } }
try {
 for (const scenario of [
  { name: 'chess-only', chess: true }, { name: 'lichess-only', lichess: true },
  { name: 'both', chess: true, lichess: true, held: true, refresh: true },
  { name: 'neither' }, { name: 'custom-practice', custom: true, practice: true },
  { name: 'legacy-complete', legacy: true }, { name: 'intro-complete-return', resolved: true },
 ]) {
  const context = await browser.newContext({ viewport: { width: scenario.custom ? 390 : 1280, height: scenario.custom ? 844 : 900 } })
  const user = { id, email: 'onboarding@example.test', aud: 'authenticated', role: 'authenticated',
   email_confirmed_at: '2026-09-01T00:00:00Z', app_metadata: {}, user_metadata: {} }
  if (scenario.resolved) user.user_metadata[introKey] = { version: 1, status: 'completed', startedAt: '2026-09-01T00:00:00Z', resolvedAt: '2026-09-01T00:01:00Z', requiresAnalysis: false }
  const session = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user }
  const profile = { user_id: id, onboarding_complete: !!(scenario.legacy || scenario.resolved),
   manual_current_rating: 800, goal_timeframe_months: 6, current_milestone_rating: 1000, estimated_rating: 800 }
  const calls = [], errors = [], imports = [], imported = []
  let releaseAnalysis
  const analysisGate = scenario.held ? new Promise(resolve => { releaseAnalysis = resolve }) : Promise.resolve()
  let pendingRead = 0
  await context.route('https://api.chess.com/**', route => {
   imports.push('chess.com')
   return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
    route.request().url().endsWith('/archives') ? { archives: ['https://api.chess.com/pub/player/tester/games/2026/09'] } : { games: [chessGame] }) })
  })
  await context.route('**/api/**', route => {
   const lichess = route.request().url().includes('/api/lichess-games')
   if (lichess) imports.push('lichess')
   return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(lichess ? { games: [lichessGame] } : { enabled: false }) })
  })
  await context.route('https://lahzgtcpbshmzsqoqswf.supabase.co/**', async route => {
   const req = route.request(), url = new URL(req.url()), path = url.pathname
   const body = req.postDataJSON?.()
   calls.push({ method: req.method(), path, body, query: url.search })
   let data = [], count = 0
   if (path === '/auth/v1/user') {
    if (req.method() === 'PUT') Object.assign(user.user_metadata, body.data)
    data = user
   } else if (path === '/auth/v1/token') data = session
   else if (path.endsWith('/user_auto_profile')) {
    if (['POST', 'PATCH'].includes(req.method())) Object.assign(profile, Array.isArray(body) ? body[0] : body)
    data = [profile]
   } else if (path.endsWith('/profiles')) data = [{ id, study_mode: 'auto' }]
   else if (path.endsWith('/user_study_plan')) data = [{ user_id: id, max_active_trainers: 3, mates_weight: 30 }]
   else if (path.endsWith('/weekly_adaptive_tests')) data = scenario.practice ? [{ state: {
    weekKey: url.searchParams.get('week_key')?.replace('eq.', ''), currentGame: 2, games: [{ completed: true }, { completed: true }],
   }}] : []
   else if (path.endsWith('/user_curriculum_state')) data = [{ user_id: id, seeded_from_existing_progress: true, rating_snapshot: 800 }]
   else if (path.endsWith('/user_curriculum_area_progress')) data = ['mates','tactics','endgame-piece-mates','endgame-studies','board-vision','openings','master-games'].map(area => ({ user_id:id, area, current_stage:1, difficulty_ceiling:1 }))
   else if (path.endsWith('/user_imported_games')) {
    if (req.method() === 'POST') imported.push(...(Array.isArray(body) ? body : [body]))
    if (url.searchParams.get('select') === 'id,pgn,source,time_class,user_color,engine_analyzed') {
     pendingRead++
     await analysisGate
     // Existing analyzed-game history: no new engine evaluation needed.
     data = []
    } else data = imported.map((g,i) => ({ ...g, id: String(i), engine_analyzed: true }))
    count = data.length
   } else if (path.includes('/rpc/')) data = { tier:'free', daily_limit:2, used_today:0, limit:2, used:0, remaining:2, allowed:true, admitted:true }
   if ((req.headers().accept || '').includes('application/vnd.pgrst.object+json') && Array.isArray(data)) data = data[0] ?? null
   await route.fulfill({ status:200, contentType:'application/json', headers: { 'content-range': '0-0/'+count }, body: req.method()==='HEAD' ? '' : JSON.stringify(data) })
  })
  await context.addInitScript(value => {
   if (!localStorage.getItem('sb-lahzgtcpbshmzsqoqswf-auth-token'))
    localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token', JSON.stringify(value))
  }, session)
  const page = await context.newPage()
  page.on('pageerror', err => errors.push(err.message))
  try {
   await page.goto(base + '/onboarding')
   if (!scenario.legacy && !scenario.resolved) {
    await page.getByRole('heading', { name:'Start your training' }).waitFor()
    assert.equal(await page.locator('form input').count(), 3)
    assert.doesNotMatch(await page.locator('main').innerText(), /Current rating|When would|months|deadline|milestone|strengths|weaknesses|preferred categories/i)
    if (scenario.chess) await page.getByLabel('Chess.com username', { exact:true }).fill('Tester')
    if (scenario.lichess) await page.getByLabel('Lichess username', { exact:true }).fill('Tester')
    await page.getByLabel('What rating would you like to reach?', { exact:true }).fill('1500')
    if (scenario.custom) {
     await page.getByRole('button', { name:'Custom', exact:true }).click()
     await page.getByLabel('Minutes per day', { exact:true }).fill('37')
    } else await page.getByRole('button', { name:'30 minutes', exact:true }).click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'responsive form has no horizontal overflow')
    if (scenario.name === 'neither' || scenario.custom) await page.screenshot({path:`node_modules/.cache/onboarding-verification/${scenario.name}-form.png`,fullPage:true})
    await Promise.all([
     page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname.endsWith('/user_auto_profile') && ['POST','PATCH'].includes(response.request().method())
     }),
     page.getByRole('button', { name:'Start My Training', exact:true }).click(),
    ])
    if (scenario.chess || scenario.lichess) {
     await page.getByRole('region', { name:'Introduction video placeholder' }).waitFor()
    }
    assert.equal(profile.target_rating,1500)
    assert.equal(profile.daily_minutes,scenario.custom ? 37 : 30)
    assert.equal(profile.onboarding_complete,true)
    assert.equal(profile.manual_current_rating,800)
    assert.equal(profile.goal_timeframe_months,6)
    assert.equal(profile.current_milestone_rating,1000)
    const mirror = calls.find(c=>c.path.endsWith('/profiles')&&c.method==='PATCH').body
    assert.equal(mirror.minutes_per_day,profile.daily_minutes)
    assert.equal(user.user_metadata[introKey].status,'pending')
    assert.equal(calls.filter(c=>c.path.includes('auto_training_chunk')).length,0,'onboarding/intro consume no chunks')
    if (scenario.chess || scenario.lichess) {
     await page.waitForFunction(() => document.body.innerText.includes('Analyzing your games'),{},{timeout:60000})
     if (scenario.refresh) {
      await page.reload()
      await page.getByRole('button',{name:'Skip introduction',exact:true}).waitFor()
      assert.equal(await page.getByRole('button',{name:'Start My Training',exact:true}).count(),0)
     }
     assert.match(await page.locator('main').innerText(), /Analyzing your games/, 'existing background analysis runs while intro remains visible')
    } else assert.equal(imports.length,0,'no-account user starts no imports')
    if (scenario.held) {
     await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/auth/v1/user') && response.request().method() === 'PUT'),
      page.getByRole('button',{name:'Skip introduction',exact:true}).click(),
     ])
     await page.getByRole('heading',{name:'Preparing your training',exact:true}).waitFor()
     assert.equal(new URL(page.url()).pathname,'/onboarding/introduction')
     await page.reload()
     await page.getByRole('heading',{name:'Preparing your training',exact:true}).waitFor()
     assert.equal(await page.getByRole('button',{name:'Skip introduction',exact:true}).count(),0,'resolved intro not replayed after refresh')
     releaseAnalysis()
    } else {
     await page.waitForURL(url => !['/onboarding','/onboarding/introduction','/auto'].includes(url.pathname),{timeout:60000})
     assert.equal(await page.getByRole('button',{name:'Skip introduction',exact:true}).count(),0,'completed analysis does not wait for the introduction')
    }
    assert.equal(user.user_metadata[introKey].status, scenario.held ? 'skipped' : 'pending')
    assert.equal(imports.includes('chess.com'),!!scenario.chess)
    assert.equal(imports.includes('lichess'),!!scenario.lichess)
   }
   await page.waitForURL(url => !['/onboarding','/onboarding/introduction','/auto'].includes(url.pathname),{timeout:60000})
   if (scenario.practice) {
    assert.match(new URL(page.url()).pathname,/^\/(mates|tactics)\/m\d+\//)
    await page.locator('[data-square="e4"]').first().waitFor({timeout:45000})
    assert.ok(calls.some(c=>c.path.endsWith('/rpc/claim_auto_training_chunk')),'first genuinely new practice activity still uses normal quota admission')
   } else {
    assert.equal(new URL(page.url()).pathname,'/play-computer')
    await page.getByText('Ready',{exact:true}).waitFor({timeout:60000})
    await page.locator('.play-computer-status-text').filter({hasText:'White to move'}).waitFor({timeout:60000})
    await page.locator('[data-square="e4"]').first().waitFor()
    assert.equal(calls.filter(c=>c.path.includes('auto_training_chunk')).length,0,'Weekly starts quota-free')
   }
   assert.equal(await page.getByRole('button',{name:/View My Training Plan|Start Weekly Game|Start Practice/}).count(),0)
   const writesBefore = calls.filter(c=>c.method==='PUT').length
   await page.goto(base+'/onboarding')
   await page.waitForURL(url=>!url.pathname.startsWith('/onboarding')&&url.pathname!=='/auto',{timeout:60000})
   assert.equal(calls.filter(c=>c.method==='PUT').length,writesBefore,'returning users are not re-enrolled')
   assert.deepEqual(errors,[])
   console.log('PASS real app:',scenario.name,'profile persistence, intro lifecycle, zero intro quota, concrete Auto/Weekly handoff')
  } catch (err) {
   console.error({ scenario:scenario.name,url:page.url(),errors,profile,imports,pendingRead,text:(await page.locator('body').innerText()).slice(-4000) })
   throw err
  } finally { releaseAnalysis?.(); await context.close() }
 }
} finally { await browser.close(); await new Promise(resolve=>server.httpServer.close(resolve)) }
