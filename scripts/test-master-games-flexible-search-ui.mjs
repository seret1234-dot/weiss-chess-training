import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4212
const baseUrl = `http://${host}:${port}`

const pair = Array.from({ length: 56 }, (_, index) => {
  const fischerWhite = index % 2 === 0
  return {
    id: 75000 + index,
    slug: `fischer-spassky-${index + 1}`,
    title: fischerWhite ? 'Fischer, Robert James vs Spassky, Boris V' : 'Spassky, Boris V vs Fischer, Robert James',
    white: fischerWhite ? 'Fischer, Robert James' : 'Spassky, Boris V',
    black: fischerWhite ? 'Spassky, Boris V' : 'Fischer, Robert James',
    result: index % 3 === 0 ? '1-0' : '1/2-1/2',
    event: 'World Championship 28th',
    site: 'Reykjavik',
    year: 1972,
    opening: 'Ruy Lopez · Closed Variations',
    eco: 'C93',
    description: null,
    total_count: 56,
  }
})

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

async function configure(page, calls) {
  page.setDefaultTimeout(15_000)
  await page.route('**/auth/v1/**', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'logged out' }) })
  })
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url()
    const body = route.request().postDataJSON?.() ?? {}
    if (url.includes('/rpc/master_game_player_suggestions_flexible')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ name: 'Fischer, Robert James' }]) })
      return
    }
    if (url.includes('/rpc/search_master_games_flexible')) {
      calls.push(body)
      const start = (Number(body.p_page_num || 1) - 1) * 30
      const rows = pair.slice(start, start + 30)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
      return
    }
    if (url.includes('/rpc/browse_master_games')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pair.slice(0, 30)) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

async function waitForCall(calls, predicate, startAt = 0) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const found = calls.slice(startAt).find(predicate)
    if (found) return found
    await new Promise((done) => setTimeout(done, 50))
  }
  throw new Error(`Expected RPC call not observed. Calls: ${JSON.stringify(calls, null, 2)}`)
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
    const page = await context.newPage()
    const calls = []
    await configure(page, calls)
    await page.goto(`${baseUrl}/master-games`, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Search anything').waitFor()

    const geometry = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panel: document.querySelector('label')?.closest('div')?.parentElement?.getBoundingClientRect().width ?? 0,
    }))
    assert.ok(geometry.documentWidth <= geometry.viewport + 1, `${viewport.name}: no horizontal overflow`)

    if (viewport.name === 'wide desktop') {
      let callStart = calls.length
      await page.getByLabel('Search anything').fill('fischer vs spassky')
      const pairCall = await waitForCall(calls, (call) => call.p_player_1 === 'fischer' && call.p_player_2 === 'spassky', callStart)
      assert.equal(pairCall.p_q, '')
      await page.getByText('56 results').waitFor()
      assert.equal(await page.locator('a[href^="/master-games/"]').count(), 30)

      callStart = calls.length
      await page.getByRole('button', { name: 'Next' }).first().click()
      const secondPageCall = await waitForCall(calls, (call) => call.p_page_num === 2, callStart)
      assert.equal(secondPageCall.p_player_1, 'fischer')
      await page.getByText('Page 2 / 2').first().waitFor()
      assert.equal(await page.locator('a[href^="/master-games/"]').count(), 26)

      await page.getByRole('button', { name: 'Clear filters' }).click()
      callStart = calls.length
      await page.getByLabel('Player 1', { exact: true }).fill('Robert Fischer')
      await page.getByLabel('Player 2 (optional)').fill('Boris Spassky')
      await page.getByLabel('Player 1 color').selectOption('white')
      const dedicated = await waitForCall(calls, (call) => call.p_player_1 === 'robert fischer' && call.p_player_2 === 'boris spassky' && call.p_player_1_color === 'white', callStart)
      assert.equal(dedicated.p_page_num, 1)

      await page.getByRole('button', { name: 'Clear filters' }).click()
      callStart = calls.length
      await page.getByLabel('Opening').fill('ruy lopes')
      const openingCall = await waitForCall(calls, (call) => call.p_opening === 'ruy lopes', callStart)
      assert.equal(openingCall.p_player_1, '')
    }

    await context.close()
  }

  console.log('PASS: Master Games flexible-search UI sends normalized pair/player/opening RPCs, preserves page filters, paginates 56 results stably, and has no overflow at 1920x1080, 1366x768, or 390x844')
} finally {
  await browser?.close()
  vite.kill()
}
