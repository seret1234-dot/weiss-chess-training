import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4221
const baseUrl = `http://${host}:${port}`
const supabaseOrigin = 'https://lahzgtcpbshmzsqoqswf.supabase.co'
const authStorageKey = 'sb-lahzgtcpbshmzsqoqswf-auth-token'
const pgn = `[Event "My Library rendered fixture"]
[Site "Local"]
[Date "2026.09.05"]
[Round "1"]
[White "Library White"]
[Black "Library Black"]
[Result "*"]

1. Nf3 Nf6 2. Ng1 Ng8 *`

const games = Array.from({ length: 56 }, (_, index) => ({
  id: 91000 + index,
  slug: `my-library-game-${index + 1}`,
  title: `Saved Master Game ${index + 1}`,
  white: `White ${index + 1}`,
  black: `Black ${index + 1}`,
  result: index % 2 === 0 ? '1-0' : '0-1',
  event: 'My Library QA',
  site: 'Local',
  year: 2026,
  round: '1',
  opening: 'Knight Opening',
  eco: 'A00',
  description: 'Rendered My Library fixture',
  pgn_storage_key: `my-library-game-${index + 1}.pgn`,
}))

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function userFor(id) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${id}@example.test`,
    email_confirmed_at: '2026-09-05T00:00:00.000Z',
    created_at: '2026-09-05T00:00:00.000Z',
    updated_at: '2026-09-05T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { username: id },
  }
}

function sessionFor(user) {
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86_400 })}.fixture`,
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
    try { if ((await fetch(baseUrl)).ok) return } catch {}
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(`Vite preview did not start:\n${viteOutput}`)
}

async function configure(context, userId, initialIds) {
  const user = userId ? userFor(userId) : null
  const savedIds = new Set(initialIds)
  const writes = []
  const requests = []

  await context.addInitScript(({ key, session }) => {
    if (session) localStorage.setItem(key, JSON.stringify(session))
    else localStorage.removeItem(key)
  }, { key: authStorageKey, session: user ? sessionFor(user) : null })

  await context.route(`${supabaseOrigin}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push({ method: request.method(), pathname: url.pathname, search: url.search, headers: request.headers() })

    if (url.pathname === '/auth/v1/user') {
      await route.fulfill(user
        ? { status: 200, contentType: 'application/json', body: JSON.stringify(user) }
        : { status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'not authenticated' }) })
      return
    }

    if (url.pathname.includes('/storage/v1/object/public/master-games-pgn/')) {
      await route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', body: pgn })
      return
    }

    if (url.pathname === '/rest/v1/user_master_games') {
      const method = request.method()
      const gameFilter = url.searchParams.get('game_id')
      const requestedId = gameFilter?.startsWith('eq.') ? Number(gameFilter.slice(3)) : null

      if (method === 'POST') {
        const body = request.postDataJSON()
        const row = Array.isArray(body) ? body[0] : body
        writes.push({ method, row })
        savedIds.add(Number(row.game_id))
        await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
        return
      }

      if (method === 'DELETE') {
        writes.push({ method, requestedId })
        if (requestedId !== null) savedIds.delete(requestedId)
        await route.fulfill({ status: 204, body: '' })
        return
      }

      const current = games.filter((game) => savedIds.has(game.id)).reverse()
      if (method === 'HEAD') {
        await route.fulfill({
          status: current.length > 1 ? 206 : 200,
          headers: {
            'Content-Range': current.length ? `0-0/${current.length}` : '*/0',
            'Content-Type': 'application/json',
            'Access-Control-Expose-Headers': 'Content-Range',
          },
        })
        return
      }

      if (requestedId !== null) {
        const found = savedIds.has(requestedId) ? { game_id: requestedId } : null
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(found) })
        return
      }

      if (url.searchParams.get('select') === 'game_id') {
        await route.fulfill({
          status: current.length > 1 ? 206 : 200,
          contentType: 'application/json',
          headers: {
            'Content-Range': current.length ? `0-0/${current.length}` : '*/0',
            'Access-Control-Expose-Headers': 'Content-Range',
          },
          body: JSON.stringify(current.length ? [{ game_id: current[0].id }] : []),
        })
        return
      }

      const range = request.headers().range?.match(/(\d+)-(\d+)/)
      const from = range ? Number(range[1]) : Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 0)
      const to = range ? Number(range[2]) : limit > 0 ? from + limit - 1 : current.length - 1
      const rows = current.slice(from, to + 1).map((game, index) => ({
        game_id: game.id,
        added_at: new Date(Date.UTC(2026, 8, 5, 12, 0, current.length - (from + index))).toISOString(),
        master_game: game,
      }))
      const last = rows.length ? from + rows.length - 1 : from
      await route.fulfill({
        status: rows.length < current.length ? 206 : 200,
        contentType: 'application/json',
        headers: {
          'Content-Range': rows.length ? `${from}-${last}/${current.length}` : '*/0',
          'Access-Control-Expose-Headers': 'Content-Range',
        },
        body: JSON.stringify(rows),
      })
      return
    }

    if (url.pathname === '/rest/v1/rpc/next_user_master_game') {
      const currentId = Number(request.postDataJSON()?.p_current_game_id ?? 0)
      const current = games.filter((game) => savedIds.has(game.id)).reverse()
      const currentIndex = current.findIndex((game) => game.id === currentId)
      const next = currentId ? current[currentIndex + 1] : current[0]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(next ? [{ id: next.id, slug: next.slug }] : []) })
      return
    }

    if (url.pathname === '/rest/v1/master_games') {
      const slugFilter = url.searchParams.get('slug')
      const idFilter = url.searchParams.get('id')
      const game = slugFilter?.startsWith('eq.')
        ? games.find((item) => item.slug === decodeURIComponent(slugFilter.slice(3)))
        : idFilter?.startsWith('eq.')
          ? games.find((item) => item.id === Number(idFilter.slice(3)))
          : games[0]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(game ?? null) })
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

  return { savedIds, writes, requests }
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
    const backend = await configure(context, 'user-a', games.map((game) => game.id))
    const page = await context.newPage()
    const consoleMessages = []
    page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`))

    await page.goto(`${baseUrl}/master-games`, { waitUntil: 'domcontentloaded' })
    const libraryButton = page.getByRole('button', { name: /^My Library/ })
    await libraryButton.waitFor()
    try {
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'My Library (56)'))
    } catch {
      assert.fail(`${viewport.name}: saved count did not load; button=${JSON.stringify((await libraryButton.textContent())?.trim())} requests=${JSON.stringify(backend.requests)} console=${JSON.stringify(consoleMessages)}`)
    }
    await assertNoOverflow(page, `${viewport.name} search`)

    await libraryButton.evaluate((button) => button.click())
    await page.getByTestId('master-game-my-library-page').waitFor()
    await page.getByText('56', { exact: true }).first().waitFor()
    assert.equal(await page.locator('.master-game-library-card').count(), 30, `${viewport.name}: first page is capped at 30`)
    await assertNoOverflow(page, `${viewport.name} My Library`)

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByText('Page 2 / 2', { exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.master-game-library-card').length === 26)
    assert.equal(await page.locator('.master-game-library-card').count(), 26, `${viewport.name}: second page contains remaining 26`)
    await context.close()
  }

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const state = await configure(context, 'user-a', [games[0].id])
  const page = await context.newPage()
  await page.goto(`${baseUrl}/master-games/${games[0].slug}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Remove from My Library' }).waitFor()
  await page.getByRole('button', { name: 'Remove from My Library' }).click()
  await page.getByRole('button', { name: '+ Add to My Library' }).waitFor()
  assert.equal(state.savedIds.has(games[0].id), false, 'remove deletes only the bookmark fixture')
  await page.getByRole('button', { name: '+ Add to My Library' }).click()
  await page.getByRole('button', { name: 'Remove from My Library' }).waitFor()
  assert.equal(state.savedIds.has(games[0].id), true, 'add saves the current Master Game')
  assert.equal(state.writes.filter((write) => write.method === 'POST').length, 1)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Remove from My Library' }).waitFor()

  await page.goto(`${baseUrl}/master-games/my-library/practice`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(`**/master-games/${games[0].slug}?libraryPractice=1`)
  await page.getByRole('button', { name: 'Next saved game' }).waitFor()
  await context.close()

  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await configure(secondContext, 'user-b', [])
  const secondPage = await secondContext.newPage()
  await secondPage.goto(`${baseUrl}/master-games/my-library`, { waitUntil: 'domcontentloaded' })
  await secondPage.getByTestId('master-game-library-empty').waitFor()
  assert.equal(await secondPage.locator('.master-game-library-card').count(), 0, 'second account cannot see first account fixtures')
  await secondContext.close()

  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await configure(guestContext, null, [])
  const guestPage = await guestContext.newPage()
  await guestPage.goto(`${baseUrl}/master-games/${games[0].slug}`, { waitUntil: 'domcontentloaded' })
  await guestPage.getByRole('button', { name: '+ Add to My Library' }).waitFor()
  await guestPage.getByRole('button', { name: '+ Add to My Library' }).click()
  await guestPage.waitForURL('**/auth?resumeTraining=1')
  assert.equal(await guestPage.evaluate(() => JSON.parse(sessionStorage.getItem('weiss:auth-return-target:v1') || 'null')?.target), `/master-games/${games[0].slug}`)
  await guestContext.close()

  console.log('PASS: My Library renders empty/1/56 states, paginates 30+26, persists add/remove, launches saved-only practice, isolates accounts, preserves exact login return, and has no overflow at 1920x1080, 1366x768, or 390x844')
} finally {
  await browser?.close()
  vite.kill()
}
