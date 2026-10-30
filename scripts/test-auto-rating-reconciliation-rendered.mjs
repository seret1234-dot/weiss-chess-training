// Real production bundle + signed-in browser fixture. The backend responses are
// isolated in Playwright; no customer account or remote row is read or written.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview } from 'vite'

const server = await preview({ mode: 'production', preview: { host: '127.0.0.1', port: 0, open: false } })
const base = server.resolvedUrls.local[0].replace(/\/$/, '')
const origin = 'https://lahzgtcpbshmzsqoqswf.supabase.co'
const user = { id: '6f6e6c47-0734-41d8-8c03-048480b6b4c2', email: 'rating-reconcile@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const session = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }

// This is the observed ordering: target fallback seeds first, then rapid 605
// arrives from Chess.com before the next new Auto decision.
const curriculumState = {
  user_id: user.id, seeded_from_existing_progress: true,
  rating_snapshot: 2000, rating_source: 'target', imported_weakness_area: null,
  source_profile_updated_at: '2026-10-30T21:06:40.000Z', category_weights: {}, legacy_category_stats: {},
}
const areas = [
  ['mates', 20], ['tactics', 30], ['endgame-piece-mates', 15], ['endgame-studies', 2],
  ['openings', 10], ['master-games', 5], ['board-vision', 18],
].map(([area, category_weight]) => ({ user_id: user.id, area, category_weight, current_stage: 1, difficulty_ceiling: 4, temporary_reinforcement: false, reinforcement_until: null }))
const profile = { user_id: user.id, onboarding_complete: true, target_rating: 2000, detected_ratings: { rapid: 605 }, estimated_rating: null, engine_analysis_summary: {}, engine_analyzed_games_count: 0, updated_at: '2026-10-30T21:07:58.000Z' }
const weekDate = new Date()
weekDate.setHours(0, 0, 0, 0)
weekDate.setDate(weekDate.getDate() - (weekDate.getDay() === 0 ? 6 : weekDate.getDay() - 1))
const currentWeekKey = `${weekDate.getFullYear()}-${String(weekDate.getMonth() + 1).padStart(2, '0')}-${String(weekDate.getDate()).padStart(2, '0')}`
const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  let reconciliationWrites = 0
  const errors = []
  await context.route(`${origin}/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const single = (request.headers().accept || '').includes('application/vnd.pgrst.object+json')
    let data = []
    if (path === '/auth/v1/token') data = session
    else if (path === '/auth/v1/user') data = user
    else if (path.endsWith('/profiles')) data = [{ id: user.id, onboarding_complete: true, study_mode: 'auto' }]
    else if (path.endsWith('/user_auto_profile')) data = [profile]
    else if (path.endsWith('/user_curriculum_state')) {
      if (request.method() === 'PATCH') {
        Object.assign(curriculumState, request.postDataJSON())
        reconciliationWrites += 1
      }
      data = [curriculumState]
    } else if (path.endsWith('/user_curriculum_area_progress')) data = areas
    else if (path.endsWith('/weekly_adaptive_tests')) data = [{ state: {
      weekKey: currentWeekKey, currentGame: 2, assessment: { status: 'skipped' },
      games: [{ completed: false }, { completed: false }], updatedAt: '2026-10-30T20:00:00.000Z',
    }, completed_at: '2026-10-30T20:00:00.000Z' }]
    else if (path.endsWith('/claim_auto_training_chunk')) data = { allowed: true, tier: 'free', used: 1, remaining: 1, limit: 2 }
    else if (path.includes('/rpc/')) data = { allowed: true, tier: 'free', used: 0, remaining: 2, limit: 2 }
    if (single && Array.isArray(data)) data = data[0] ?? null
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' }, body: request.method() === 'HEAD' ? '' : JSON.stringify(data) })
  })
  await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' }))
  await context.addInitScript(value => localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token', JSON.stringify(value)), session)
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/auto?continue=1&debugAuto=1`)
  await page.waitForURL(url => /^\/tactics\/m1\//.test(url.pathname), { timeout: 45000 })
  await page.locator('[data-square]').first().waitFor({ timeout: 45000 })
  assert.equal(curriculumState.rating_snapshot, 605, 'the durable curriculum snapshot is reconciled before the new route is selected')
  assert.equal(curriculumState.rating_source, 'detected', 'the snapshot records Chess.com rapid rather than target fallback')
  assert.equal(reconciliationWrites, 1, 'the one-time reconciliation does not create unrelated progress writes')
  assert.doesNotMatch(page.url(), /bishop-fork.*m2|\/m2\/bishop-fork/, 'stale target state cannot redirect a 605 user to the repeated Bishop Fork M2 route')
  assert.deepEqual(errors, [])
  await context.close()
  console.log('PASS: signed-in rendered target 2000 → Chess.com rapid 605 reconciliation persists before Auto selects an M1 tactic route')
} finally {
  await browser.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
