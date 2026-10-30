// Actual production bundle + rendered button. Backend data is an isolated
// in-memory Supabase fixture; no customer data or live database is contacted.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { Chess } from 'chess.js'

const server = process.env.AUTO_DEMO_URL ? null : await preview({ mode: 'production', preview: { host: '127.0.0.1', port: 0, open: false } })
const base = process.env.AUTO_DEMO_URL || server.resolvedUrls.local[0].replace(/\/$/, '')
const user = { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', email: 'skip-a@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const otherUserId = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const session = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user }
const monday = new Date(); monday.setDate(monday.getDate() - (monday.getDay() || 7) + 1)
const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
const keyFor = pgn => { const game = new Chess(); game.loadPgn(pgn); const moves = game.history({ verbose: true }); return `${moves[0]?.before ?? game.fen()}|${moves.map(move => move.from + move.to + (move.promotion ?? '')).join(' ')}` }
const empty = color => ({ color, started: false, completed: false, pgn: '', fen: new Chess().fen(), result: '*', updatedAt: '1970-01-01T00:00:00.000Z' })
const fresh = () => ({ userId: user.id, weekKey, engineElo: 1500, currentGame: 0, games: [empty('white'), empty('black')], updatedAt: '2026-10-30T00:00:00.000Z' })
const afterGameOne = () => {
 const game = new Chess(); game.move('e4'); game.move('e5')
 const pgn = game.pgn(), at = '2026-10-30T00:01:00.000Z'
 return { userId: user.id, weekKey, engineElo: 1500, reviewFlowVersion: 1, currentGame: 1, updatedAt: at,
  games: [{ color: 'white', started: true, completed: true, pgn, fen: game.fen(), result: '1-0', updatedAt: at,
   explainedReview: { version: 1, gameKey: keyFor(pgn), currentPly: 2, furthestPly: 2, skippedAt: at } }, empty('black')] }
}
const browser = await chromium.launch({ headless: true })

async function exercise(label, seed, viewport) {
 const context = await browser.newContext({ viewport })
 let cloud = structuredClone(seed)
 const calls = [], errors = []
 const otherState = { userId: otherUserId, weekKey, currentGame: 0, marker: 'other-account-progress' }
 await context.route('https://lahzgtcpbshmzsqoqswf.supabase.co/**', async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname
  calls.push(`${req.method()} ${path}`)
  let data = []
  if (path === '/auth/v1/user') data = user
  else if (path === '/auth/v1/token') data = session
  else if (path.endsWith('/weekly_adaptive_tests')) {
   if (req.method() === 'GET') data = [{ state: cloud, updated_at: cloud.updatedAt }]
   else { cloud = req.postDataJSON().state; data = { state: cloud } }
  } else if (path.endsWith('/profiles')) data = [{ id: user.id, onboarding_complete: true }]
  else if (path.endsWith('/user_auto_profile')) data = [{ user_id: user.id, onboarding_complete: true, current_rating: 1200, manual_current_rating: 1200, daily_minutes: 20 }]
  else if (path.endsWith('/user_study_plan')) data = [{ user_id: user.id, max_active_trainers: 3, mates_weight: 30 }]
  else if (path.endsWith('/user_curriculum_state')) data = [{ user_id: user.id, seeded_from_existing_progress: true, rating_snapshot: 1200 }]
  else if (path.endsWith('/user_curriculum_area_progress') || path.endsWith('/user_curriculum_session_evidence') || path.endsWith('/training_progress') || path.endsWith('/user_chunk_progress')) data = []
  else if (path.includes('/rpc/')) data = { tier: 'free', limit: 2, used: 0, remaining: 2, allowed: true }
  if ((req.headers().accept || '').includes('application/vnd.pgrst.object+json') && Array.isArray(data)) data = data[0] ?? null
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
 })
 await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' }))
 await context.addInitScript(({ session, seed, otherUserId, otherState }) => {
  localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token', JSON.stringify(session))
  localStorage.setItem(`weiss-weekly-adaptive-test-v1:account:${session.user.id}`, JSON.stringify(seed))
  localStorage.setItem(`weiss-weekly-adaptive-test-v1:account:${otherUserId}`, JSON.stringify(otherState))
 }, { session, seed, otherUserId, otherState })
 const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
 try {
  await page.goto(`${base}/play-computer?weekly=1`)
  const skip = page.getByRole('button', { name: 'Skip Test Games', exact: true })
  await skip.waitFor({ timeout: 30000 })
  await assert.doesNotReject(() => skip.click({ timeout: 10000 }), `${label}: button is visible and clickable`)
  await page.waitForFunction(id => {
   const raw = localStorage.getItem(`weiss-weekly-adaptive-test-v1:account:${id}`)
   return raw && JSON.parse(raw).assessment?.status === 'skipped'
  }, user.id, { timeout: 30000 })
  await page.waitForURL(url => url.pathname !== '/play-computer', { timeout: 30000 })
  assert.equal(cloud.assessment.status, 'skipped', `${label}: skip is durable in the account record`)
  assert.equal(cloud.completedAt, undefined, `${label}: skip is not a completed/rated assessment`)
  assert.ok(!cloud.planSignals, `${label}: skip writes no assessment adjustment`)
  assert.equal(await page.evaluate(({ otherUserId, otherState }) => localStorage.getItem(`weiss-weekly-adaptive-test-v1:account:${otherUserId}`) === JSON.stringify(otherState), { otherUserId, otherState }), true, `${label}: other account cache remains unchanged`)
  assert.equal(calls.filter(call => /\/rpc\//.test(call) && /claim|consume|allowance/i.test(call)).length, 0, `${label}: skipping makes no allowance claim`)
  await page.goto(`${base}/play-computer?weekly=1`)
  await page.waitForURL(url => url.pathname !== '/play-computer', { timeout: 30000 })
  assert.deepEqual(errors, [], `${label}: no rendered runtime errors`)
  console.log(`PASS ${label}: rendered skip persists through refresh, opens Auto, preserves account isolation, and makes no allowance claim`)
 } finally { await context.close() }
}

try {
 await exercise('before Game 1 desktop', fresh(), { width: 1440, height: 900 })
 await exercise('after Game 1 mobile', afterGameOne(), { width: 390, height: 844 })
} finally {
 await browser.close()
 await new Promise(resolve => server ? server.httpServer.close(resolve) : resolve())
}
