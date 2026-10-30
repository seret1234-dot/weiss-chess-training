import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { preview } from 'vite'

// This deliberately runs the built application under two fixture identities.
// No network request reaches Supabase: the route below is a small in-memory
// implementation of the tables touched by PatternTacticTrainer.
const server = await preview({
  mode: 'production',
  build: { outDir: 'dist' },
  preview: { host: '127.0.0.1', port: 4196, strictPort: true },
})
const baseUrl = 'http://127.0.0.1:4196'
const course = 'Tactics'
const theme = 'Bishop Fork'
const trainerKey = 'tactic-bishop-fork-m1:m1-verified-final-v1'
const chunk = JSON.parse(await readFile('public/data/verified-lichess-tactics-v1/final-v6/bishop-fork-m1/chunk-01.json', 'utf8'))
const puzzleIds = chunk.exercises.map((exercise) => exercise.id)
const fixtureUsers = {
  a: { id: 'restart-rendered-user-a', email: 'restart-a@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
  b: { id: 'restart-rendered-user-b', email: 'restart-b@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
}
const db = {
  chunkRows: [
    { user_id: fixtureUsers.b.id, trainer_key: trainerKey, chunk_index: 2, mastered_puzzles_count: 20, is_mastered: true },
  ],
  trainingRows: [
    { user_id: fixtureUsers.a.id, course, theme, item_id: 'different-chunk', mastery: 5 },
    { user_id: fixtureUsers.b.id, course, theme, item_id: puzzleIds[0], mastery: 5 },
  ],
  calls: [],
}

function sessionFor(user) {
  return {
    access_token: `fixture-access-${user.id}`,
    refresh_token: `fixture-refresh-${user.id}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  }
}

function requestUserId(url) {
  const raw = decodeURIComponent(url.searchParams.get('user_id') ?? '')
  return raw.replace(/^eq\./, '')
}

function upsert(rows, payload, keys) {
  const values = Array.isArray(payload) ? payload : [payload]
  for (const value of values) {
    const index = rows.findIndex((row) => keys.every((key) => row[key] === value[key]))
    if (index === -1) rows.push({ ...value })
    else rows[index] = { ...rows[index], ...value }
  }
}

async function createSignedInPage(browser, user) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 920 } })
  const session = sessionFor(user)
  await context.addInitScript((value) => {
    localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token', JSON.stringify(value))
    Object.defineProperty(performance, 'now', { value: () => 1000, configurable: true })
  }, session)
  await context.route('https://lahzgtcpbshmzsqoqswf.supabase.co/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    db.calls.push({ path, method, query: url.search })
    let data = []

    if (path === '/auth/v1/user') data = user
    else if (path === '/auth/v1/token') data = session
    else if (path.endsWith('/profiles')) data = [{ id: user.id, onboarding_complete: true }]
    else if (path.endsWith('/user_auto_profile') || path.endsWith('/user_curriculum_state') || path.endsWith('/user_curriculum_area_progress')) data = []
    else if (path.endsWith('/user_chunk_progress')) {
      if (method === 'GET') data = db.chunkRows.filter((row) => row.user_id === requestUserId(url))
      else if (method === 'POST') {
        upsert(db.chunkRows, request.postDataJSON(), ['user_id', 'trainer_key', 'chunk_index'])
        data = request.postDataJSON()
      } else if (method === 'PATCH') {
        const target = db.chunkRows.filter((row) => row.user_id === requestUserId(url)
          && row.trainer_key === decodeURIComponent(url.searchParams.get('trainer_key') ?? '').replace(/^eq\./, '')
          && row.chunk_index === Number((url.searchParams.get('chunk_index') ?? '').replace(/^eq\./, '')))
        for (const row of target) Object.assign(row, request.postDataJSON())
        data = target
      }
    } else if (path.endsWith('/training_progress')) {
      const userId = requestUserId(url)
      if (method === 'GET') {
        const selectedCourse = decodeURIComponent(url.searchParams.get('course') ?? '').replace(/^eq\./, '')
        const selectedTheme = decodeURIComponent(url.searchParams.get('theme') ?? '').replace(/^eq\./, '')
        data = db.trainingRows.filter((row) => row.user_id === userId && row.course === selectedCourse && row.theme === selectedTheme)
      } else if (method === 'POST') {
        upsert(db.trainingRows, request.postDataJSON(), ['user_id', 'course', 'theme', 'item_id'])
        data = request.postDataJSON()
      } else if (method === 'DELETE') {
        const selectedCourse = decodeURIComponent(url.searchParams.get('course') ?? '').replace(/^eq\./, '')
        const selectedTheme = decodeURIComponent(url.searchParams.get('theme') ?? '').replace(/^eq\./, '')
        const rawIds = decodeURIComponent(url.searchParams.get('item_id') ?? '')
        const ids = new Set((rawIds.match(/\((.*)\)/)?.[1] ?? '').split(',').map((value) => value.replaceAll('"', '')).filter(Boolean))
        db.trainingRows = db.trainingRows.filter((row) => !(row.user_id === userId && row.course === selectedCourse && row.theme === selectedTheme && ids.has(row.item_id)))
      }
    } else if (path.includes('/rpc/')) data = []

    if ((request.headers().accept ?? '').includes('application/vnd.pgrst.object+json') && Array.isArray(data)) data = data[0] ?? null
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' },
      body: method === 'HEAD' ? '' : JSON.stringify(data),
    })
  })
  await context.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' }))
  return { context, page: await context.newPage() }
}

async function waitForTrainer(page, chunkNumber = 1) {
  await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 45_000 })
  await page.getByText(new RegExp(`^Chunk ${chunkNumber} / \\d+$`)).last().waitFor({ state: 'visible', timeout: 45_000 })
}

async function playRealExercise(page, exercise, expectedPuzzleNumber) {
  await page.getByText(new RegExp(`^Puzzle ${expectedPuzzleNumber} / \\d+$`)).first().waitFor({ state: 'visible', timeout: 45_000 })
  // The verified source may include a short opponent pre-move animation. Do
  // not click through it: this is intentionally the same unlocked-board state
  // a learner uses before a real move.
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => (
    button.textContent?.trim() === 'Silent error' && !button.disabled
  )), undefined, { timeout: 45_000 })
  const move = exercise.solutionLine[0]
  await page.locator(`[data-square="${move.slice(0, 2)}"]`).first().click()
  await page.locator(`[data-square="${move.slice(2, 4)}"]`).first().click()
  await page.getByText('Correct', { exact: true }).first().waitFor({ timeout: 45_000 })
  await page.getByRole('button', { name: 'Next Puzzle', exact: true }).click()
}

const browser = await chromium.launch({ headless: true })
try {
  const a = await createSignedInPage(browser, fixtureUsers.a)
  try {
    await a.page.goto(`${baseUrl}/tactics/m1/bishop-fork`, { waitUntil: 'commit' })
    await a.page.getByText('Chunk navigation', { exact: true }).waitFor({ timeout: 45_000 })
    await waitForTrainer(a.page)

    // Exercise the actual rendered board twice before resetting. The verified
    // final-v6 route keeps per-puzzle counters in its account-scoped browser
    // resume record and chunk completion in Supabase, so both stores are
    // asserted below.
    await playRealExercise(a.page, chunk.exercises[0], 1)
    await playRealExercise(a.page, chunk.exercises[1], 2)
    await a.page.getByRole('button', { name: 'Restart progression', exact: true }).click()
    await waitForTrainer(a.page)
    await a.page.getByText(/^Puzzle 1 \/ \d+$/).first().waitFor({ timeout: 45_000 })
    assert.equal(await a.page.getByText(/0 \/ 5 fast solves/).count(), 1, 'restart visibly resets the current chunk')
    assert.ok(db.chunkRows.some((row) => row.user_id === fixtureUsers.a.id && row.trainer_key === trainerKey && row.chunk_index === 1 && row.is_mastered === false && row.mastered_puzzles_count === 0), `current user current chunk persisted at zero: ${JSON.stringify(db.calls)}`)
    const persisted = await a.page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) => candidate.includes('pattern_tactic_progress_tactic-bishop-fork-m1:m1-verified-final-v1'))
      return key ? JSON.parse(localStorage.getItem(key) ?? '{}') : null
    })
    assert.ok(persisted, 'account-scoped browser progression exists')
    assert.equal(persisted.currentChunkIndex, 0)
    assert.equal(persisted.currentPuzzleIndex, 0)
    assert.ok(persisted.chunkProgressByFile['chunk-01.json'].every((value) => value === 0), 'every current-chunk fast-solve counter is reset')
    assert.ok(db.trainingRows.some((row) => row.user_id === fixtureUsers.a.id && row.item_id === 'different-chunk'), 'other chunk progress remains intact')

    await a.page.reload({ waitUntil: 'commit' })
    await waitForTrainer(a.page)
    await a.page.getByText(/^Puzzle 1 \/ \d+$/).first().waitFor({ timeout: 45_000 })
    assert.equal(await a.page.getByText(/0 \/ 5 fast solves/).count(), 1, 'refresh cannot restore stale progress')
  } finally {
    await a.context.close()
  }

  const b = await createSignedInPage(browser, fixtureUsers.b)
  try {
    await b.page.goto(`${baseUrl}/tactics/m1/bishop-fork`, { waitUntil: 'commit' })
    await b.page.getByText('Chunk navigation', { exact: true }).waitFor({ timeout: 45_000 })
    assert.ok(db.chunkRows.some((row) => row.user_id === fixtureUsers.b.id && row.trainer_key === trainerKey && row.chunk_index === 2 && row.is_mastered), 'switching accounts preserves the other account\'s persisted chunk')
    const keys = await b.page.evaluate(() => Object.keys(localStorage))
    assert.equal(keys.some((key) => key.includes(fixtureUsers.a.id)), false, 'account B cannot read account A browser progress')
  } finally {
    await b.context.close()
  }
  console.log('PASS signed-in rendered Restart Progression: real board moves, current-chunk reset, refresh persistence, and account isolation')
} finally {
  await browser.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
