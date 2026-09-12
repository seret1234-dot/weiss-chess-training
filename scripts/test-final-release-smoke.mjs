import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Real production-bundle smoke: no API fixtures, accounts, or remote writes.
// The same test can verify the deployed canonical domain after release.
const base = process.env.RELEASE_SMOKE_BASE_URL ?? 'http://127.0.0.1:4212'
const browser = await chromium.launch({ headless: true })
const errors = []
const masterRequests = new Set()
const themeKey = 'weiss-chess-site-theme-v2'
async function checkTheme(page, theme, asset) {
  await page.waitForFunction(({ key, value }) => localStorage.getItem(key) === value, { key: themeKey, value: theme })
  const pieces = page.locator(`.accessible-chessboard img[src^="${asset}"]`)
  await pieces.first().waitFor({ timeout: 30000 })
  // A visible <img> can precede completion of its first uncached network load.
  await page.waitForFunction(prefix => {
    const images = [...document.querySelectorAll('.accessible-chessboard img')].filter(img => img.getAttribute('src')?.startsWith(prefix))
    return images.length > 0 && images.every(img => img.complete && img.naturalWidth > 0)
  }, asset, { timeout: 30000 })
}
async function selectTheme(page, label) {
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: 'Menu', exact: true }).hover()
    const toggle = page.locator('.global-floating-play-desktop .theme-quick-toggle')
    await toggle.waitFor({ state: 'visible' })
    const before = await toggle.textContent()
    if (before.includes(label)) return
    await toggle.click()
    await page.waitForFunction(previous => document.querySelector('.global-floating-play-desktop .theme-quick-toggle')?.textContent !== previous, before)
  }
  throw new Error(`Theme selector did not reach ${label}`)
}
try {
  const discovery = await browser.newPage()
  const openingResponse = discovery.waitForResponse(r => r.url().includes('/rest/v1/opening_lines?') && r.status() === 200, { timeout: 60000 })
  await discovery.goto(`${base}/openings`)
  const openings = await (await openingResponse).json()
  assert.ok(openings[0]?.slug, 'real opening catalog has a route')
  const openingPath = `/openings/${encodeURIComponent(openings[0].slug)}`
  await discovery.close()
  const routes = [
    ['Home', '/', false],
    ['Board Vision', '/board-vision', true],
    ['Opening', openingPath, true],
    ['Regular Mate', '/mates/m1/back-rank', true],
    ['Regular Tactic', '/tactics/m1/bishop-fork', true],
    ['Master Mate', '/master-mates/1/smothered', true],
    ['Master Tactic', '/master-tactics/2/bishop-fork', true],
    ['Endgame', '/endgame/piece-mates/kqk', true],
    ['Master Games', '/master-games/terry-r-vs-nakamura-hi-2026-2nd-3-0-thu-1st-jan-2026-77b505ca', true],
    ['Kill Box', '/mates/m1/kill-box-adjacent-rook', true],
  ]
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 650 }]) {
    for (const [label, path, hasBoard] of routes) {
      const context = await browser.newContext({ viewport })
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(`${path}: ${error.message}`))
      page.on('request', request => {
        if (request.url().includes('/master-puzzles/')) masterRequests.add(request.url())
      })
      try {
        const response = await page.goto(base + path, { waitUntil: 'domcontentloaded' })
        assert.equal(response.status(), 200, `${path}: HTTP 200`)
        await page.getByRole('button', { name: 'Menu', exact: true }).waitFor({ timeout: 60000 })
        if (label === 'Board Vision') {
          // Its square-recognition exercise deliberately has an empty board.
          await page.locator('.board-vision-board .accessible-chessboard').waitFor()
          assert.equal(await page.evaluate(key => localStorage.getItem(key), themeKey), 'merida')
        } else if (hasBoard) await checkTheme(page, 'merida', '/pieces/merida/')
        assert.equal(new URL(page.url()).pathname, path, `${label}: no unexpected redirect`)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`)
        const side = page.locator('.trainer-shell-side')
        if (await page.locator('.trainer-puzzle-panel').count()) {
          await page.getByText(/^Find (?:the (?:mate|tactic)|move)/).waitFor({ timeout: 60000 })
          assert.equal(await page.locator('.trainer-puzzle-panel-reference .site-explanation-box').count(), 1, `${label}: shared explanation area`)
          assert.match(await side.innerText(), /Chunk navigation/)
          assert.equal(await page.locator('.global-floating-hint').count(), 0)
          if (path.startsWith('/master-')) assert.match(await page.locator('.trainer-puzzle-panel-reference').innerText(), /Master game/i)
          for (const name of ['Hint', 'Silent error', 'Next Puzzle', 'Restart progression']) {
            const button = side.getByRole('button', { name, exact: true })
            await button.scrollIntoViewIfNeeded()
            await button.click({ trial: true, timeout: 5000 })
            const box = await button.boundingBox()
            const footer = await page.locator('.compliance-footer').boundingBox()
            assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1, `${label}/${name}: reachable`)
            assert.ok(box.y + box.height <= footer.y + 1, `${label}/${name}: footer clear`)
          }
        }
        if (label === 'Regular Mate' && viewport.width === 1920) {
          await selectTheme(page, 'Classic')
          await page.reload()
          await checkTheme(page, 'classic', '/pieces/react-chessboard-default/')
          await selectTheme(page, 'Default (Merida)')
          await page.reload()
          await checkTheme(page, 'merida', '/pieces/merida/')
          console.log('PASS: real theme selector Classic/reload and Default/Merida/reload')
        }
        console.log(`PASS ${viewport.width}x${viewport.height} ${label}: ${path}`)
      } catch (error) {
        throw new Error(`${label} ${viewport.width}x${viewport.height}: ${error.message}; rendered=${(await page.locator('body').innerText()).slice(0,1500)}`)
      } finally { await context.close() }
    }
  }
  assert.deepEqual(errors, [])
  const requests = [...masterRequests]
  assert.ok(requests.some(url => url.endsWith('/catalog.json')), 'real Master catalog loaded')
  assert.ok(requests.some(url => url.includes('/indexes/')), 'real Master indexes loaded')
  assert.ok(requests.some(url => url.includes('/puzzles/chunk-')), 'real Master shards loaded')
  assert.ok(requests.every(url => url.startsWith('https://lahzgtcpbshmzsqoqswf.supabase.co/storage/v1/object/public/master-puzzles/v1/v1/')), 'all Master JSON comes from the configured external source')
  // A training chunk contains multiple puzzles distributed across canonical
  // shards. Count payload shards, not indexes plus shards across all visits.
  const payloadShards = requests.filter(url => url.includes('/puzzles/chunk-'))
  assert.ok(payloadShards.length < 100, `only the two active training chunks load, not all 1612 shards: ${payloadShards.length}`)
  console.log(JSON.stringify({ result: 'Combined release smoke PASS', base, renderedChecks: 20, distinctMasterRequests: requests.length, payloadShards: payloadShards.length, masterRequests: requests }))
} finally { await browser.close() }
