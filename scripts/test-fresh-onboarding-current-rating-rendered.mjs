// Production bundle + rendered fresh-account path. Every API is an isolated
// Playwright fixture; this test never reads or writes a live account.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview } from 'vite'

const server = await preview({ mode: 'production', preview: { host: '127.0.0.1', port: 0, open: false } })
const base = server.resolvedUrls.local[0].replace(/\/$/, '')
const origin = 'https://lahzgtcpbshmzsqoqswf.supabase.co'
const user = { id: '60500000-0000-4000-8000-000000000001', email: 'fresh-605@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const session = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }
const browser = await chromium.launch({ headless: true })

try {
 const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
 const profile = { user_id: user.id, onboarding_complete: false, target_rating: null, daily_minutes: 20 }
 let curriculumState = null
 let areaRows = []
 let weekly = null
 const errors = []
 const writes = []

 await context.route('https://api.chess.com/**', route => {
  const url = new URL(route.request().url())
  if (url.pathname.endsWith('/stats')) {
   return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chess_rapid: { last: { rating: 605 } } }) })
  }
  if (url.pathname.endsWith('/archives')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ archives: [] }) })
  return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
 })
 await context.route(`${origin}/**`, async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname
  const body = request.postDataJSON?.()
  const single = (request.headers().accept || '').includes('application/vnd.pgrst.object+json')
  const write = ['POST', 'PATCH', 'PUT'].includes(request.method())
  if (write) writes.push({ path, body: structuredClone(body) })
  let data = [], count = 0
  if (path === '/auth/v1/token' || path === '/auth/v1/user') {
   if (path === '/auth/v1/user' && request.method() === 'PUT') Object.assign(user.user_metadata, body.data)
   data = path.endsWith('/token') ? session : user
  } else if (path.endsWith('/profiles')) data = [{ id: user.id, onboarding_complete: profile.onboarding_complete, study_mode: 'auto' }]
  else if (path.endsWith('/user_auto_profile')) {
   if (write) Object.assign(profile, Array.isArray(body) ? body[0] : body)
   data = [profile]
  } else if (path.endsWith('/user_study_plan')) data = [{ user_id: user.id, max_active_trainers: 3, mates_weight: 30 }]
  else if (path.endsWith('/user_curriculum_state')) {
   if (request.method() === 'POST') curriculumState = { ...(Array.isArray(body) ? body[0] : body), seeded_from_existing_progress: false }
   if (request.method() === 'PATCH') Object.assign(curriculumState, body)
   data = curriculumState ? [curriculumState] : []
  } else if (path.endsWith('/user_curriculum_area_progress')) {
   if (request.method() === 'POST') areaRows = Array.isArray(body) ? body : [body]
   data = areaRows
  } else if (path.endsWith('/user_curriculum_stage_progress') || path.endsWith('/user_curriculum_theme_progress') || path.endsWith('/user_curriculum_session_evidence') || path.endsWith('/user_chunk_progress') || path.endsWith('/training_progress') || path.endsWith('/user_category_stats')) {
   data = []
  } else if (path.endsWith('/weekly_adaptive_tests')) {
   if (write) weekly = { state: (Array.isArray(body) ? body[0] : body).state, updated_at: new Date().toISOString() }
   data = weekly ? [weekly] : []
  } else if (path.includes('/rpc/')) data = { tier: 'free', limit: 2, used: 0, remaining: 2, allowed: true, admitted: true }
  if (single && Array.isArray(data)) data = data[0] ?? null
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-0/${count}` }, body: request.method() === 'HEAD' ? '' : JSON.stringify(data) })
 })
 await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' }))
 await context.addInitScript(value => localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token', JSON.stringify(value)), session)
 const page = await context.newPage()
 page.on('pageerror', error => errors.push(error.message))

 await page.goto(`${base}/onboarding`)
 await page.getByLabel('Chess.com username', { exact: true }).fill('rapid605')
 await page.getByLabel('What rating would you like to reach?', { exact: true }).fill('2000')
 await page.getByRole('button', { name: 'Start My Training', exact: true }).click()
 await page.getByRole('button', { name: 'Skip introduction', exact: true }).waitFor({ timeout: 30000 })
 assert.deepEqual(profile.detected_ratings, { rapid: 605 }, 'onboarding persists the direct current Chess.com rapid rating before Auto')
 assert.equal(curriculumState?.rating_snapshot, 605, 'fresh curriculum is initialized from 605, not the 2000 target')
 assert.equal(curriculumState?.rating_source, 'detected', 'the curriculum records the approved detected-rating source')
 assert.equal(profile.onboarding_complete, true, 'onboarding completes only after the curriculum seed is durable')

 await page.getByRole('button', { name: 'Skip introduction', exact: true }).click()
 await page.getByRole('button', { name: 'Skip Test Games', exact: true }).waitFor({ timeout: 45000 })
 await page.getByRole('button', { name: 'Skip Test Games', exact: true }).click()
 await page.waitForURL(url => /\/(mates|tactics)\/m1\//.test(url.pathname), { timeout: 60000 })
 assert.match(page.url(), /\/(mates|tactics)\/m1\//, 'skipping intro and assessments enters the approved beginner M1 plan')
 assert.doesNotMatch(page.url(), /\/m[234]\//, 'the target-rating M2+ route is never selected')
 assert.equal(weekly?.state?.assessment?.status, 'skipped', 'assessment skip is distinct and durable')
 assert.ok(writes.some(write => write.path.endsWith('/user_curriculum_state')), 'the rendered path durably seeds curriculum state')
 assert.deepEqual(errors, [])
 await context.close()
 console.log('PASS: rendered fresh 605 rapid rating resolves before curriculum seed; skip intro + assessments opens beginner M1 Auto without target-rating placement')
} finally {
 await browser.close()
 await new Promise(resolve => server.httpServer.close(resolve))
}
