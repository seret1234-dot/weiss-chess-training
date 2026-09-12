import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4237
const baseUrl = `http://${host}:${port}`
const supabaseOrigin = 'https://lahzgtcpbshmzsqoqswf.supabase.co'
const authStorageKey = 'sb-lahzgtcpbshmzsqoqswf-auth-token'

const openings = Array.from({ length: 56 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  slug: `sicilian-defense-najdorf-fixture-${index + 1}`,
  name: `Sicilian Defense: Najdorf Variation ${index + 1}`,
  family: 'Sicilian Defense',
  family_slug: 'sicilian-defense',
  variation: 'Najdorf Variation',
  subvariation: index % 2 ? 'Poisoned Pawn' : null,
  eco: index % 2 ? 'B97' : 'B90',
  aliases: [],
  uci_moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
  san_moves: ['e4', 'e5', 'Nf3', 'Nc6'],
  ply_count: 4,
  final_epd: null,
  side: 'white',
}))

function encode(value) { return Buffer.from(JSON.stringify(value)).toString('base64url') }
function userFor(id) {
  return { id, aud: 'authenticated', role: 'authenticated', email: `${id}@example.test`, email_confirmed_at: '2026-09-06T00:00:00Z', created_at: '2026-09-06T00:00:00Z', updated_at: '2026-09-06T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { username: id } }
}
function sessionFor(user) {
  return { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.fixture`, refresh_token: `refresh-${user.id}`, expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, token_type: 'bearer', user }
}

const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', host, '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let viteOutput = ''
vite.stdout.on('data', (chunk) => { viteOutput += chunk })
vite.stderr.on('data', (chunk) => { viteOutput += chunk })

async function waitForServer() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try { if ((await fetch(baseUrl)).ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Vite preview did not start:\n${viteOutput}`)
}

async function configure(context, userId, initialIds) {
  const user = userId ? userFor(userId) : null
  const savedIds = new Set(initialIds)
  const writes = []

  await context.addInitScript(({ key, session }) => {
    if (session) localStorage.setItem(key, JSON.stringify(session))
    else localStorage.removeItem(key)
  }, { key: authStorageKey, session: user ? sessionFor(user) : null })

  await context.route(`${supabaseOrigin}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/auth/v1/user') {
      await route.fulfill(user ? { status: 200, contentType: 'application/json', body: JSON.stringify(user) } : { status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'not authenticated' }) })
      return
    }

    if (url.pathname === '/rest/v1/user_opening_library') {
      const method = request.method()
      const openingFilter = url.searchParams.get('opening_id')
      const requestedId = openingFilter?.startsWith('eq.') ? openingFilter.slice(3) : null
      if (method === 'POST') {
        const body = request.postDataJSON()
        const row = Array.isArray(body) ? body[0] : body
        savedIds.add(row.opening_id)
        writes.push({ method, row })
        await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
        return
      }
      if (method === 'DELETE') {
        if (requestedId) savedIds.delete(requestedId)
        writes.push({ method, openingId: requestedId })
        await route.fulfill({ status: 204, body: '' })
        return
      }
      const current = openings.filter((opening) => savedIds.has(opening.id)).reverse()
      if (request.method() === 'HEAD') {
        await route.fulfill({ status: current.length > 1 ? 206 : 200, headers: { 'Content-Range': current.length ? `0-0/${current.length}` : '*/0', 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Type': 'application/json' } })
        return
      }
      if (requestedId) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(savedIds.has(requestedId) ? { opening_id: requestedId } : null) })
        return
      }
      if (url.searchParams.get('select') === 'opening_id') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current.map(({ id }) => ({ opening_id: id }))) })
        return
      }
      const range = request.headers().range?.match(/(\d+)-(\d+)/)
      const from = range ? Number(range[1]) : Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 30)
      const to = range ? Number(range[2]) : from + limit - 1
      const rows = current.slice(from, to + 1).map((opening, index) => ({ opening_id: opening.id, added_at: new Date(Date.UTC(2026, 8, 6, 12, 0, current.length - from - index)).toISOString(), opening_line: opening }))
      const last = rows.length ? from + rows.length - 1 : from
      await route.fulfill({ status: rows.length < current.length ? 206 : 200, contentType: 'application/json', headers: { 'Content-Range': rows.length ? `${from}-${last}/${current.length}` : '*/0', 'Access-Control-Expose-Headers': 'Content-Range' }, body: JSON.stringify(rows) })
      return
    }

    if (url.pathname === '/rest/v1/opening_lines') {
      const slugFilter = url.searchParams.get('slug')
      const familyFilter = url.searchParams.get('family')
      const familySlugFilter = url.searchParams.get('family_slug')
      let rows = openings
      if (slugFilter?.startsWith('eq.')) rows = rows.filter((opening) => opening.slug === decodeURIComponent(slugFilter.slice(3)))
      if (familyFilter?.startsWith('eq.')) rows = rows.filter((opening) => opening.family === decodeURIComponent(familyFilter.slice(3)))
      if (familySlugFilter?.startsWith('eq.')) rows = rows.filter((opening) => opening.family_slug === decodeURIComponent(familySlugFilter.slice(3)))
      const wantsObject = (request.headers().accept ?? '').includes('application/vnd.pgrst.object+json')
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wantsObject ? rows[0] ?? null : rows) })
      return
    }

    if (url.pathname === '/rest/v1/training_progress') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    if (url.pathname === '/rest/v1/rpc/next_user_opening') {
      const currentId = request.postDataJSON()?.p_current_opening_id ?? null
      const current = openings.filter((opening) => savedIds.has(opening.id)).reverse()
      const index = current.findIndex((opening) => opening.id === currentId)
      const next = currentId ? current[index + 1] : current[0]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(next ? [{ id: next.id, slug: next.slug }] : []) })
      return
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const wantsObject = (request.headers().accept ?? '').includes('application/vnd.pgrst.object+json')
      await route.fulfill({ status: 200, contentType: 'application/json', body: wantsObject ? 'null' : '[]' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  return { savedIds, writes }
}

async function assertNoOverflow(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: no horizontal overflow`)
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  for (const viewport of [
    { width: 1920, height: 1080, name: 'wide desktop' },
    { width: 1366, height: 768, name: 'desktop' },
    { width: 390, height: 844, name: 'mobile' },
  ]) {
    const context = await browser.newContext({ viewport })
    await configure(context, 'user-a', openings.map(({ id }) => id))
    const page = await context.newPage()
    await page.goto(`${baseUrl}/openings`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'My Openings (56)' }).waitFor()
    await page.getByLabel('Search openings').fill('najdrof')
    await page.getByText('56 matching lines', { exact: true }).waitFor()
    await assertNoOverflow(page, `${viewport.name} opening search`)
    await page.getByRole('button', { name: 'My Openings (56)' }).click()
    await page.getByTestId('my-openings-page').waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.my-openings-card').length === 30)
    assert.equal(await page.locator('.my-openings-card').count(), 30)
    await assertNoOverflow(page, `${viewport.name} My Openings`)
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByText('Page 2 / 2', { exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.my-openings-card').length === 26)
    await context.close()
  }

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const state = await configure(context, 'user-a', [openings[0].id])
  const page = await context.newPage()
  await page.goto(`${baseUrl}/openings/${openings[0].slug}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Remove from My Openings' }).waitFor()
  await page.getByRole('button', { name: 'Remove from My Openings' }).click()
  await page.getByRole('button', { name: 'Add to My Openings' }).waitFor()
  assert.equal(state.savedIds.has(openings[0].id), false)
  await page.getByRole('button', { name: 'Add to My Openings' }).click()
  await page.getByRole('button', { name: 'Remove from My Openings' }).waitFor()
  assert.equal(state.savedIds.has(openings[0].id), true)
  assert.equal(state.writes.filter(({ method }) => method === 'POST').length, 1)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Remove from My Openings' }).waitFor()
  await page.goto(`${baseUrl}/openings/my-openings/practice`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(`**/openings/${openings[0].slug}?libraryPractice=1`)
  await page.getByRole('button', { name: 'Next saved opening' }).waitFor()
  await context.close()

  const otherContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await configure(otherContext, 'user-b', [])
  const otherPage = await otherContext.newPage()
  await otherPage.goto(`${baseUrl}/openings/my-openings`, { waitUntil: 'domcontentloaded' })
  await otherPage.getByTestId('my-openings-empty').waitFor()
  assert.equal(await otherPage.locator('.my-openings-card').count(), 0)
  await otherContext.close()

  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await configure(guestContext, null, [])
  const guestPage = await guestContext.newPage()
  await guestPage.goto(`${baseUrl}/openings/${openings[0].slug}?family=sicilian-defense`, { waitUntil: 'domcontentloaded' })
  await guestPage.getByRole('button', { name: 'Add to My Openings' }).waitFor()
  await guestPage.getByRole('button', { name: 'Add to My Openings' }).click()
  await guestPage.waitForURL('**/auth?resumeTraining=1')
  assert.equal(await guestPage.evaluate(() => JSON.parse(sessionStorage.getItem('weiss:auth-return-target:v1') || 'null')?.target), `/openings/${openings[0].slug}?family=sicilian-defense`)
  await guestContext.close()

  console.log('PASS: My Openings production UI searches fuzzily, shows auth count, paginates 30+26, persists idempotent add/remove, practices saved lines only, isolates users, preserves exact login return, and has no overflow at 1920x1080, 1366x768, or 390x844')
} finally {
  await browser?.close()
  vite.kill()
}
