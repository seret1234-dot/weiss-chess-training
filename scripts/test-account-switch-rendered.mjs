// Production bundle and real auth/router components. Two synthetic accounts in
// one browser profile; all backend traffic is intercepted, never live user data.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { Chess } from 'chess.js'
const server = await preview({ mode: 'production', preview: { host: '127.0.0.1', port: 0 } })
const base = server.resolvedUrls.local[0].replace(/\/$/, '')
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const users = Object.fromEntries([A, B].map((id, i) => [id, { id, email: `isolation-${i}@example.test`, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }]))
const session = id => ({ access_token: `fixture-${id}`, refresh_token: `refresh-${id}`, token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user: users[id] })
const monday = new Date(); monday.setDate(monday.getDate() - (monday.getDay() || 7) + 1)
const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
const game = new Chess(); game.loadPgn('1. d4 d5')
const gameA = { color: 'white', started: true, completed: false, pgn: game.pgn(), fen: game.fen(), result: '*', updatedAt: new Date().toISOString() }
const stateA = { userId: A, weekKey, engineElo: 1500, currentGame: 0, reviewFlowVersion: 1, games: [gameA, { ...gameA, color: 'black', started: false, pgn: '', fen: new Chess().fen() }], updatedAt: gameA.updatedAt }
const key = (name, id) => `${name}:account:${id}`
const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1920, height: 1080 }]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 768, isMobile: viewport.width < 768 })
    let cloud = structuredClone(stateA)
    const writes = [], errors = []
    await context.route('**/*.supabase.co/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname
      const body = request.postDataJSON(), method = request.method(), write = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
      const owner = request.headers().authorization?.includes(B) ? B : A
      let data = []
      if (path === '/auth/v1/token') data = session(body.email === users[B].email ? B : A)
      else if (path === '/auth/v1/user') data = users[owner]
      else if (path === '/auth/v1/logout') { await route.fulfill({ status: 204 }); return }
      else if (path.endsWith('/user_auto_profile')) data = [{ user_id: owner, onboarding_complete: owner === A, estimated_rating: 1500, daily_minutes: 20 }]
      else if (path.endsWith('/profiles')) data = [{ id: owner, study_mode: 'auto' }]
      else if (path.endsWith('/weekly_adaptive_tests')) {
        if (write) {
          assert.equal(body.user_id, owner, 'late write must never change account ownership')
          assert.equal(owner, A, 'new B must not adopt/write Weekly progress before onboarding')
          cloud = structuredClone(body.state); writes.push(body)
        }
        data = owner === A ? [{ state: cloud, updated_at: cloud.updatedAt }] : []
      } else if (path.includes('/rpc/')) data = { tier: 'free', allowed: true, daily_limit: 2, used_today: 0, remaining: 2 }
      if ((request.headers().accept || '').includes('application/vnd.pgrst.object+json') && Array.isArray(data)) data = data[0] ?? null
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    await context.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' }))
    await context.addInitScript(({ sessionA, stateA, A }) => {
      if (sessionStorage.getItem('isolation-seeded')) return
      sessionStorage.setItem('isolation-seeded', 'yes')
      localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token', JSON.stringify(sessionA))
      localStorage.setItem('weiss-weekly-adaptive-test-v1', JSON.stringify(stateA))
      sessionStorage.setItem(`weiss-auto-entry-demo-v1:${A}`, '/play-computer?weekly=1&auto=1')
      sessionStorage.setItem('weiss:auth-return-target:v1', JSON.stringify({ target: '/mates/m1/back-rank?auto=1', createdAt: Date.now() }))
      sessionStorage.setItem('weiss-play-computer-session-v1', JSON.stringify({ fen: stateA.games[0].fen, pgn: stateA.games[0].pgn }))
      sessionStorage.setItem('weissAnalyzeReviewPgn', stateA.games[0].pgn)
    }, { sessionA: session(A), stateA, A })
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message))
    const logout = async () => {
      if (viewport.width >= 768) await page.locator('.global-floating-play-desktop__tab').hover()
      await page.locator('button:visible').filter({ hasText: /^Logout$/ }).click()
      await page.waitForURL(u => ['/', '/auth'].includes(u.pathname))
    }
    const login = async id => {
      await page.goto(base + '/auth?resumeTraining=1')
      await page.getByLabel('Email', { exact: true }).fill(users[id].email)
      await page.getByLabel('Password', { exact: true }).fill('fixture-password-only')
      await page.locator('form button[type="submit"]').click()
    }
    try {
      await page.goto(base + '/')
      await page.waitForURL('**/play-computer?weekly=1&auto=1', { timeout: 60000 })
      await page.getByText('Account sync active', { exact: true }).waitFor({ timeout: 60000 })
      assert.equal(cloud.games[0].pgn, gameA.pgn)
      await logout(); await login(B)
      await page.waitForURL('**/onboarding', { timeout: 30000 })
      await page.getByRole('heading', { name: 'Start your training', exact: true }).waitFor()
      await page.reload(); await page.getByRole('heading', { name: 'Start your training', exact: true }).waitFor()
      assert.equal(await page.evaluate(id => sessionStorage.getItem(`weiss-auto-entry-demo-v1:${id}`), B), null, 'old route not recorded as B bookmark')
      assert.equal(await page.evaluate(id => localStorage.getItem(`weiss-weekly-adaptive-test-v1:account:${id}`), B), null)
      await logout(); await login(A)
      await page.waitForURL('**/play-computer?weekly=1&auto=1', { timeout: 60000 })
      await page.getByText('Account sync active', { exact: true }).waitFor({ timeout: 60000 })
      assert.equal(cloud.games[0].pgn, gameA.pgn, 'A resumes exact own game after B')
      const own = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key('weiss-weekly-adaptive-test-v1', A))
      assert.equal(own.games[0].pgn, gameA.pgn)
      for (const destination of ['/home', '/manual']) {
        await page.goto(base + destination); await page.reload(); assert.equal(new URL(page.url()).pathname, destination)
        await page.goto(base + '/demo-auto'); await page.waitForURL('**/play-computer?weekly=1&auto=1', { timeout: 60000 })
      }
      assert.deepEqual(errors, [])
      console.log('PASS production account switch A -> logout -> new B onboarding -> refresh -> logout -> A exact Weekly resume; Home/Manual return', viewport, { writes: writes.length })
    } catch (e) { console.error({ viewport, url: page.url(), errors, text: (await page.locator('body').innerText()).slice(-2500) }); throw e }
    finally { await context.close() }
  }
} finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)) }
