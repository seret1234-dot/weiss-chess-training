import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { once } from 'node:events'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4207
const baseUrl = `http://${host}:${port}`
const supabaseOrigin = 'https://lahzgtcpbshmzsqoqswf.supabase.co'
const masterDataRoot = resolve(root, 'public/data/master-puzzles/v1')
const externalMasterMarker = '/storage/v1/object/public/master-puzzles/v1/v1/'
const returnStorageKey = 'weiss:auth-return-target:v1'

await access(chromium.executablePath())

const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', host, '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let viteOutput = ''
vite.stdout.on('data', (chunk) => { viteOutput += chunk })
vite.stderr.on('data', (chunk) => { viteOutput += chunk })

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try { if ((await fetch(baseUrl)).ok) return } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Vite preview did not become ready:\n${viteOutput}`)
}

function mockUser(id = 'auth-return-user') {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${id}@example.test`,
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { username: id },
  }
}

function mockSession(user) {
  return {
    access_token: `mock-access-${user.id}`,
    refresh_token: `mock-refresh-${user.id}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  }
}

async function installMockBackend(context, state) {
  await context.route(`${supabaseOrigin}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname.includes(externalMasterMarker)) {
      const relative = decodeURIComponent(url.pathname.split(externalMasterMarker)[1])
      const body = await readFile(join(masterDataRoot, ...relative.split('/')))
      await route.fulfill({ status: 200, contentType: 'application/json', body })
      return
    }

    if (url.pathname === '/auth/v1/token') {
      if (state.failLogin) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }) })
        return
      }
      state.user = mockUser('login-user')
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSession(state.user)) })
      return
    }

    if (url.pathname === '/auth/v1/signup') {
      state.signupRequestUrl = request.url()
      state.user = mockUser('signup-user')
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSession(state.user)) })
      return
    }

    if (url.pathname === '/auth/v1/user') {
      if (request.method() === 'PUT' && state.user) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.user) })
        return
      }
      if (state.user) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.user) })
      } else {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'not authenticated' }) })
      }
      return
    }

    if (url.pathname === '/rest/v1/rpc/get_training_item_usage_status') {
      state.quotaRefreshes += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tier: 'free', limit: 10, used: state.authenticatedUsed, remaining: Math.max(0, 10 - state.authenticatedUsed), reset_at: '2026-09-06T00:00:00.000Z' }),
      })
      return
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      const wantsSingle = (request.headers().accept ?? '').includes('application/vnd.pgrst.object+json')
      await route.fulfill({ status: 200, contentType: 'application/json', body: wantsSingle ? 'null' : '[]' })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

async function createFixture(browser, viewport, overrides = {}) {
  const context = await browser.newContext({ viewport })
  const state = { user: null, failLogin: false, authenticatedUsed: 0, quotaRefreshes: 0, signupRequestUrl: null, ...overrides }
  await installMockBackend(context, state)
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(`${viewport.width}x${viewport.height}: ${error.message}`))
  await page.addInitScript(() => {
    localStorage.setItem('weiss-training-guest-usage-v1', '10')
    localStorage.setItem('auth-return-progress-fixture', JSON.stringify({ chunk: 17, puzzle: 8, mastery: 4 }))
    localStorage.setItem('weiss_piece_theme', 'merida')
    localStorage.setItem('weiss-chess-show-board-coordinates-v1', 'false')
  })
  return { context, page, state }
}

async function waitForLocation(page, expected) {
  await page.waitForFunction(
    (target) => `${window.location.pathname}${window.location.search}${window.location.hash}` === target,
    expected,
    { timeout: 30_000 },
  )
}

async function signInFromLimit(browser, testCase) {
  const fixture = await createFixture(browser, testCase.viewport)
  const { context, page, state } = fixture
  await page.goto(`${baseUrl}${testCase.target}`, { waitUntil: 'commit' })
  await page.getByText('You completed 10 free training items', { exact: true }).waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByRole('heading', { name: 'Log In', exact: true }).waitFor()

  await page.locator('input').nth(0).fill('learner@example.test')
  await page.locator('input').nth(1).fill('correct-password')
  await page.locator('form').getByRole('button', { name: 'Log In', exact: true }).click()
  await waitForLocation(page, testCase.target)
  await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 60_000 })

  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), returnStorageKey), null, `${testCase.name}: target is consumed after success`)
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('auth-return-progress-fixture'))), { chunk: 17, puzzle: 8, mastery: 4 }, `${testCase.name}: progress survives auth`)
  assert.equal(await page.evaluate(() => localStorage.getItem('weiss_piece_theme')), 'merida', `${testCase.name}: piece preference survives auth`)
  assert.equal(await page.evaluate(() => localStorage.getItem('weiss-chess-show-board-coordinates-v1')), 'false', `${testCase.name}: coordinate preference survives auth`)
  assert.ok(state.quotaRefreshes >= 1, `${testCase.name}: authenticated quota is rechecked`)

  await page.goBack({ waitUntil: 'commit' })
  assert.notEqual(new URL(page.url()).pathname, '/auth', `${testCase.name}: Back cannot bounce to auth`)
  await context.close()
}

async function testFailedAndCancelledAuth(browser) {
  const target = '/tactics/m1/knight-fork?chunk=17&puzzle=8'
  const { context, page, state } = await createFixture(browser, { width: 1920, height: 1080 }, { failLogin: true })
  await page.goto(`${baseUrl}${target}`)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.locator('input').nth(0).fill('failed@example.test')
  await page.locator('input').nth(1).fill('wrong-password')
  await page.locator('form').getByRole('button', { name: 'Log In', exact: true }).click()
  await page.getByText('Invalid login credentials', { exact: true }).waitFor()
  assert.ok(await page.evaluate((key) => sessionStorage.getItem(key), returnStorageKey), 'failed auth preserves the target')
  state.failLogin = false
  await page.goBack({ waitUntil: 'commit' })
  await page.getByText('You completed 10 free training items', { exact: true }).waitFor()
  assert.equal(`${new URL(page.url()).pathname}${new URL(page.url()).search}`, target, 'cancel/back returns to the exact capped trainer')
  await context.close()
}

async function testNormalHomeLogin(browser) {
  const { context, page } = await createFixture(browser, { width: 1920, height: 1080 })
  await page.goto(`${baseUrl}/`)
  await page.evaluate((key) => sessionStorage.setItem(key, JSON.stringify({ target: '/tactics/m1/knight-fork?chunk=9', createdAt: Date.now() })), returnStorageKey)
  await page.goto(`${baseUrl}/auth`)
  await page.locator('input').nth(0).fill('home@example.test')
  await page.locator('input').nth(1).fill('correct-password')
  await page.locator('form').getByRole('button', { name: 'Log In', exact: true }).click()
  await waitForLocation(page, '/')
  await context.close()
}

async function testAuthenticatedStillCapped(browser) {
  const target = '/mates/m1/back-rank?chunk=50&puzzle=12'
  const { context, page, state } = await createFixture(browser, { width: 390, height: 844 }, { authenticatedUsed: 10 })
  await page.goto(`${baseUrl}${target}`)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.locator('input').nth(0).fill('capped@example.test')
  await page.locator('input').nth(1).fill('correct-password')
  await page.locator('form').getByRole('button', { name: 'Log In', exact: true }).click()
  await waitForLocation(page, target)
  await page.getByText('You completed today’s 10 free training items', { exact: true }).waitFor()
  assert.ok(state.quotaRefreshes >= 1, 'capped account was rechecked after auth')
  assert.equal(`${new URL(page.url()).pathname}${new URL(page.url()).search}`, target, 'capped account remains in place')
  await context.close()
}

async function testSignupFromFreeLimit(browser) {
  const target = '/tactics/m1/knight-fork?chunk=3&puzzle=4'
  const { context, page, state } = await createFixture(browser, { width: 390, height: 844 })
  await page.goto(`${baseUrl}${target}`)
  await page.getByRole('button', { name: 'Create free account', exact: true }).click()
  await page.getByRole('heading', { name: 'Create Free Account', exact: true }).waitFor()
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), returnStorageKey), null, 'choosing signup clears any training-login return target')
  await page.locator('input').nth(0).fill('signup@example.test')
  await page.locator('input').nth(1).fill('correct-password')
  await page.locator('form').getByRole('button', { name: 'Create Free Account', exact: true }).click()
  await waitForLocation(page, '/onboarding')
  assert.equal(new URL(state.signupRequestUrl).searchParams.get('redirect_to'), `${baseUrl}/onboarding`, 'free-cap signup confirmation target remains canonical onboarding')
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), returnStorageKey), null, 'free-cap signup leaves no stale training-login target')
  await context.close()
}

async function testNormalSignup(browser) {
  const { context, page, state } = await createFixture(browser, { width: 1920, height: 1080 })
  await page.goto(`${baseUrl}/`)
  await page.evaluate((key) => sessionStorage.setItem(key, JSON.stringify({ target: '/mates/m1/back-rank?chunk=9', createdAt: Date.now() })), returnStorageKey)
  await page.goto(`${baseUrl}/auth?mode=signup`)
  await page.getByRole('heading', { name: 'Create Free Account', exact: true }).waitFor()
  await page.waitForFunction((key) => sessionStorage.getItem(key) === null, returnStorageKey)
  await page.locator('input').nth(0).fill('normal-signup@example.test')
  await page.locator('input').nth(1).fill('correct-password')
  await page.locator('form').getByRole('button', { name: 'Create Free Account', exact: true }).click()
  await waitForLocation(page, '/onboarding')
  assert.equal(new URL(state.signupRequestUrl).searchParams.get('redirect_to'), `${baseUrl}/onboarding`, 'normal signup confirmation target remains canonical onboarding')
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), returnStorageKey), null, 'normal signup clears stale training-login state')
  await context.close()
}

let browser
const pageErrors = []
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() })

  const cases = [
    { name: 'regular Tactics desktop', target: '/tactics/m1/knight-fork?chunk=3&puzzle=4#board', viewport: { width: 1920, height: 1080 } },
    { name: 'regular Mates mobile', target: '/mates/m1/back-rank?chunk=17&puzzle=8', viewport: { width: 390, height: 844 } },
    { name: 'Master Tactics desktop', target: '/master-tactics/2/bishop-fork?chunk=4&puzzle=7', viewport: { width: 1920, height: 1080 } },
    { name: 'Master Mates mobile', target: '/master-mates/1/smothered?chunk=2&puzzle=5', viewport: { width: 390, height: 844 } },
  ]

  for (const testCase of cases) await signInFromLimit(browser, testCase)
  await testSignupFromFreeLimit(browser)
  await testNormalSignup(browser)
  await testFailedAndCancelledAuth(browser)
  await testNormalHomeLogin(browser)
  await testAuthenticatedStillCapped(browser)

  assert.deepEqual(pageErrors, [])
  console.log('PASS: production-bundle auth QA returns login to exact regular/Master trainer URLs, keeps signup on canonical onboarding, rejects stale signup targets, preserves failed-login targets, and keeps normal login behavior')
} finally {
  if (browser) await browser.close().catch(() => {})
  if (vite.exitCode == null) {
    vite.kill()
    await Promise.race([once(vite, 'exit'), new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000))]).catch(() => {})
  }
}
