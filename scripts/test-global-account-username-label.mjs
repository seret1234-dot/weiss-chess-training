import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4201
const baseUrl = `http://${host}:${port}`
const storageKey = 'sb-lahzgtcpbshmzsqoqswf-auth-token'

function jwtFor(userId) {
 const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
 return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86_400 })}.test`
}

function authUser(overrides = {}) {
 return {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'fallback@example.com',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  phone: '',
  confirmed_at: '2026-01-01T00:00:00.000Z',
  last_sign_in_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  is_anonymous: false,
  ...overrides,
 }
}

function sessionFor(user) {
 return {
  access_token: jwtFor(user.id),
  refresh_token: `refresh-${user.id}`,
  expires_in: 86_400,
  expires_at: Math.floor(Date.now() / 1000) + 86_400,
  token_type: 'bearer',
  user,
 }
}

const vite = spawn(process.execPath, [
 resolve(root, 'node_modules/vite/bin/vite.js'),
 'preview', '--host', host, '--port', String(port), '--strictPort',
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let viteOutput = ''
vite.stdout.on('data', (chunk) => { viteOutput += chunk })
vite.stderr.on('data', (chunk) => { viteOutput += chunk })

async function waitForServer() {
 const deadline = Date.now() + 30_000
 while (Date.now() < deadline) {
  try { const response = await fetch(baseUrl); if (response.ok) return } catch {}
  await new Promise((done) => setTimeout(done, 100))
 }
 throw new Error(`Vite did not become ready:\n${viteOutput}`)
}

async function configurePage(page, initialUser) {
 let currentUser = initialUser
 const initialSession = initialUser ? sessionFor(initialUser) : null

 page.setDefaultNavigationTimeout(90_000)

 await page.addInitScript(({ key, session }) => {
  if (sessionStorage.getItem('weiss-account-label-fixture-seeded') === '1') return
  sessionStorage.setItem('weiss-account-label-fixture-seeded', '1')
  if (session) localStorage.setItem(key, JSON.stringify(session))
  else localStorage.removeItem(key)
 }, { key: storageKey, session: initialSession })

 await page.route('**/auth/v1/**', async (route) => {
  const request = route.request()
  const url = request.url()

  if (url.includes('/logout')) {
   currentUser = null
   await route.fulfill({ status: 204, body: '' })
   return
  }

  if (url.includes('/token') && url.includes('grant_type=password')) {
   currentUser = authUser({
    id: '00000000-0000-4000-8000-000000000002',
    email: 'second@example.com',
    user_metadata: { display_name: 'Second Player' },
   })
   await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(sessionFor(currentUser)),
   })
   return
  }

  if (url.endsWith('/user') && request.method() === 'PUT' && currentUser) {
   const payload = request.postDataJSON()
   currentUser = {
    ...currentUser,
    user_metadata: { ...currentUser.user_metadata, ...(payload?.data ?? {}) },
    updated_at: new Date().toISOString(),
   }
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentUser) })
   return
  }

  if (url.endsWith('/user') && currentUser) {
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentUser) })
   return
  }

  await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Unexpected auth request in test' }) })
 })

 await page.route('**/rest/v1/**', async (route) => {
  const request = route.request()
  const body = request.method() === 'GET' ? '[]' : '{}'
  await route.fulfill({ status: 200, contentType: 'application/json', body })
 })
}

async function assertLabelSafe(page, expected, viewportName, route) {
 const label = page.locator('.global-account-label')
 await label.waitFor({ state: 'visible' })
 assert.equal((await label.textContent())?.trim(), expected, `${viewportName} ${route}: correct account label`)
 assert.equal(await label.getAttribute('title'), expected, `${viewportName} ${route}: full name is accessible`)

 const geometry = await label.evaluate((element) => {
  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  const topmost = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)[0]
  return {
   left: rect.left,
   right: rect.right,
   top: rect.top,
   bottom: rect.bottom,
   position: style.position,
   overflow: style.overflow,
   textOverflow: style.textOverflow,
   whiteSpace: style.whiteSpace,
   topmostIsLabel: topmost === element || element.contains(topmost),
   documentWidth: document.documentElement.scrollWidth,
   viewportWidth: window.innerWidth,
  }
 })

 assert.equal(geometry.position, 'fixed', `${viewportName} ${route}: label does not shift page layout`)
 assert.ok(geometry.left >= 0 && geometry.right <= geometry.viewportWidth + 1, `${viewportName} ${route}: label stays in viewport`)
 assert.ok(geometry.top >= 0 && geometry.bottom <= 60, `${viewportName} ${route}: label stays in top chrome`)
 assert.ok(geometry.topmostIsLabel, `${viewportName} ${route}: label is not covered`)
 assert.ok(geometry.documentWidth <= geometry.viewportWidth + 1, `${viewportName} ${route}: no horizontal overflow`)
 return geometry
}

let browser
try {
 await waitForServer()
 browser = await chromium.launch({ headless: true })

 const priorityUser = authUser({
  user_metadata: {
   username: 'Ariel',
   display_name: 'Display Name',
   account_name: 'Account Name',
  },
 })
 const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
 const page = await context.newPage()
 await configurePage(page, priorityUser)
 await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
 await assertLabelSafe(page, 'Ariel', 'wide desktop', '/')

 await context.close()

 const updateContext = await browser.newContext({ viewport: { width: 1366, height: 768 } })
 const updatePage = await updateContext.newPage()
 await configurePage(updatePage, authUser({ user_metadata: { chess_com_username: 'OldChessName' } }))
 await updatePage.goto(baseUrl, { waitUntil: 'domcontentloaded' })
 await updatePage.locator('.global-account-label').filter({ hasText: 'OldChessName' }).waitFor()
 await updatePage.locator('.global-account-label').click()
 await updatePage.waitForURL('**/account')
 const chessComInput = updatePage.getByPlaceholder('Enter your Chess.com username')
 await chessComInput.waitFor()
 await chessComInput.waitFor({ state: 'visible' })
 await updatePage.waitForFunction(() => {
  const input = document.querySelector('input[placeholder="Enter your Chess.com username"]')
  return input instanceof HTMLInputElement && input.value === 'OldChessName'
 })
 await chessComInput.fill('')
 await updatePage.getByRole('button', { name: 'Save Changes', exact: true }).click()
 await updatePage.waitForTimeout(750)
 const updatedLabel = (await updatePage.locator('.global-account-label').textContent())?.trim()
 assert.equal(updatedLabel, 'fallback@example.com', `Account metadata update refreshes label immediately (observed ${updatedLabel})`)

 await updatePage.setViewportSize({ width: 390, height: 844 })
 await updatePage.getByRole('button', { name: 'Logout', exact: true }).click()
 await updatePage.locator('.global-account-label').waitFor({ state: 'detached' })
 await updatePage.waitForURL('**/auth')

 await updatePage.locator('form input').nth(0).fill('second@example.com')
 await updatePage.locator('form input[type="password"]').fill('test-password')
 await updatePage.locator('button[type="submit"]').click()
 await updatePage.waitForTimeout(1_000)
 const signedInLabel = await updatePage.locator('.global-account-label').textContent().catch(() => null)
 const authPageText = (await updatePage.locator('body').textContent())?.replace(/\s+/g, ' ').slice(0, 500)
 assert.equal(signedInLabel?.trim(), 'Second Player', `second sign-in updates the label (url=${updatePage.url()}, body=${authPageText})`)
 await updateContext.close()

 const routes = ['/', '/tactics', '/mates', '/master-tactics', '/master-mates', '/master-games', '/analyze/board']
 const longName = 'Ariel-With-An-Intentionally-Very-Long-Account-Username-For-Responsive-QA'
 for (const viewport of [
  { width: 1920, height: 1080, name: 'wide desktop' },
  { width: 1366, height: 768, name: 'desktop' },
  { width: 390, height: 844, name: 'mobile' },
 ]) {
  const responsiveContext = await browser.newContext({ viewport })
  const responsivePage = await responsiveContext.newPage()
  await configurePage(responsivePage, authUser({ user_metadata: { username: longName } }))

  for (const route of routes) {
   await responsivePage.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
   const geometry = await assertLabelSafe(responsivePage, longName, viewport.name, route)
   assert.equal(geometry.overflow, 'hidden', `${viewport.name} ${route}: long name is clipped safely`)
   assert.equal(geometry.textOverflow, 'ellipsis', `${viewport.name} ${route}: long name uses ellipsis`)
   assert.equal(geometry.whiteSpace, 'nowrap', `${viewport.name} ${route}: label remains one line`)
  }
  await responsiveContext.close()
 }

 const loggedOutContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
 const loggedOutPage = await loggedOutContext.newPage()
 await configurePage(loggedOutPage, null)
 await loggedOutPage.goto(baseUrl, { waitUntil: 'domcontentloaded' })
 await loggedOutPage.waitForTimeout(100)
 assert.equal(await loggedOutPage.locator('.global-account-label').count(), 0, 'logged-out state renders no blank account label')
 await loggedOutContext.close()

 const emailContext = await browser.newContext({ viewport: { width: 1366, height: 768 } })
 const emailPage = await emailContext.newPage()
 await configurePage(emailPage, authUser({ email: 'email-only@example.com', user_metadata: {} }))
 await emailPage.goto(baseUrl, { waitUntil: 'domcontentloaded' })
 await assertLabelSafe(emailPage, 'email-only@example.com', 'email fallback', '/')
 await emailContext.close()

 console.log('PASS: global account label uses reactive auth identity, safe fallback, sign-out/sign-in updates, and responsive non-overlapping truncation across representative routes')
} finally {
 await browser?.close()
 vite.kill()
}
