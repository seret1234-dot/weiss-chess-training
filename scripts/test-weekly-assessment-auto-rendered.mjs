// Actual bundled AutoStudyPage, planner, curriculum selector and router. Only
// backend HTTP is controlled; all sessions are fictional and no live writes occur.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { runtime as r, profile, userId, stateFor, pgn, evidence } from './test-weekly-assessment-dataflow.mjs'

const base = process.env.AUTO_DEMO_URL || 'http://localhost:5173'
const state = stateFor()
state.games = state.games.map((game, index) => ({ ...game, analysis: r.summarizeWeeklyReview(pgn, index ? 'b' : 'w', evidence().rows, evidence(index ? 52 : 51).classifications, evidence(index ? 52 : 51).losses, {}) }))
state.planSignals = r.buildWeeklyPlanSignals(state.games)
const plain = r.buildPersonalTrainingPlan(profile)
const adjusted = r.buildPersonalTrainingPlan(profile, state.planSignals.assessment.sectionMultipliers)
const slot = Array.from({ length: 100 }, (_, i) => i).find(i => r.selectScheduledSection(plain, i).key !== 'endgames' && r.selectScheduledSection(adjusted, i).key === 'endgames')
assert.notEqual(slot, undefined, 'bounded Weekly input can change an actual scheduling slot')
const user = { id: userId, email: 'weekly-auto@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const session = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user }
const browser = await chromium.launch({ headless: true })
const paths = []
try {
 for (const scenario of ['without-weekly', 'with-weekly', 'due-review']) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const calls = [], errors = []
  await context.route('https://lahzgtcpbshmzsqoqswf.supabase.co/**', async route => {
   const req = route.request(), url = new URL(req.url()), path = url.pathname
   calls.push(`${req.method()} ${path}?${url.searchParams}`)
   let data = [], count = 0
   if (path === '/auth/v1/user') data = user
   else if (path === '/auth/v1/token') data = session
   else if (path.endsWith('/profiles')) data = [{ id: userId, onboarding_complete: true }]
   else if (path.endsWith('/user_auto_profile')) data = [{ user_id: userId, ...profile }]
   else if (path.endsWith('/user_study_plan')) data = [{ user_id: userId, max_active_trainers: 3, mates_weight: 30 }]
   else if (path.endsWith('/weekly_adaptive_tests')) data = [{ state, completed_at: state.completedAt, plan_signals: scenario === 'without-weekly' ? null : state.planSignals }]
   else if (path.endsWith('/user_curriculum_state')) data = [{ user_id: userId, seeded_from_existing_progress: true, rating_snapshot: 800 }]
   else if (path.endsWith('/user_curriculum_area_progress')) data = r.CURRICULUM_AREAS.map(area => ({ user_id: userId, area, current_stage: 1, difficulty_ceiling: 1 }))
   else if (path.endsWith('/user_curriculum_session_evidence')) count = slot
   else if (path.endsWith('/user_chunk_progress') && scenario === 'due-review') data = [{ trainer_key: 'back-rank-mate-1', chunk_index: 0, next_due_at: '2020-01-01T00:00:00.000Z', is_mastered: false, mastered_puzzles_count: 0 }]
   else if (path.includes('/rpc/')) data = { tier: 'free', limit: 10, used: 0, remaining: 10, allowed: true }
   if ((req.headers().accept ?? '').includes('application/vnd.pgrst.object+json') && Array.isArray(data)) data = data[0] ?? null
   await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0,count-1)}/${count}`, 'access-control-expose-headers': 'content-range' }, body: req.method() === 'HEAD' ? '' : JSON.stringify(data) })
  })
  await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' }))
  await context.addInitScript(session => localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token', JSON.stringify(session)), session)
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message))
  await page.goto(base + '/auto?continue=1')
  try { await page.waitForURL(url => !['/auto', '/'].includes(url.pathname), { timeout: 30000 }) }
  catch (error) { console.error({ scenario, url: page.url(), text: (await page.locator('body').innerText()).slice(0,1500), calls, errors }); throw error }
  const path = new URL(page.url()).pathname
  assert.notEqual(path, '/onboarding'); assert.notEqual(path, '/auth')
  assert.ok(!['/openings','/master-games','/mates','/tactics','/endgame-studies'].includes(path), 'Auto must mount an actual activity')
  await page.locator('[data-square="e4"]').first().waitFor({ timeout: 30000 })
  paths.push(path)
  assert.ok(calls.filter(call => call.includes('select=plan_signals')).length >= 2, 'Auto fetches persisted Weekly weights on hydration and again at launch')
  if (scenario === 'with-weekly') {
   if (!path.startsWith('/endgame')) console.error({url:page.url(),calls,errors})
   assert.ok(path.startsWith('/endgame'), `Weekly-adjusted Endgames slot must actually launch Endgames: ${path}`)
  }
  if (scenario === 'due-review') assert.equal(path, '/mates/m1/back-rank', 'due review wins even with endgame assessment')
  assert.deepEqual(errors, [])
  console.log(`PASS actual /auto ${scenario} selection ${slot}: ${path}`)
  await context.close()
 }
 assert.notEqual(paths[0], paths[1], 'same profile/selection count, different persisted assessment, different actual Auto route')
 console.log('PASS E/F: due-review precedence and actual persisted Weekly → Auto selection')
} finally { await browser.close() }
