import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { Chess } from 'chess.js'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4199
const baseUrl = `http://${host}:${port}`
const pgn = `[Event "Master Games Free Play browsing regression"]
[White "White Player"]
[Black "Black Player"]

${Array.from({ length: 50 }, (_, index) => `${index + 1}. ${index % 2 === 0 ? 'Nf3 Nf6' : 'Ng1 Ng8'}`).join(' ')} *`
const fixture = {
 id: 999002,
 slug: 'free-play-browsing-regression',
 title: 'Free Play Browsing Regression',
 white: 'White Player',
 black: 'Black Player',
 event: 'Rendered QA',
 site: 'Local',
 year: 2026,
 round: '1',
 result: '*',
 opening: 'Knight repetition',
 eco: 'A00',
 pgn_storage_key: 'free-play-browsing-regression.pgn',
}

const parsedGame = new Chess()
parsedGame.loadPgn(pgn)
const history = parsedGame.history({ verbose: true })
const replay = new Chess()
const expectedFens = history.map((move) => {
 replay.move(move)
 return replay.fen()
})
const initialFen = new Chess().fen()

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

async function configurePage(page, writes) {
 await page.addInitScript(() => {
  class HarmlessWorker {
   onmessage = null
   onerror = null
   postMessage(command) {
    if (command === 'isready') {
     setTimeout(() => this.onmessage?.({ data: 'readyok' }), 0)
    } else if (String(command).startsWith('go ')) {
     setTimeout(() => {
      this.onmessage?.({ data: 'info depth 1 score cp 0 pv g1f3' })
      this.onmessage?.({ data: 'bestmove g1f3' })
     }, 0)
    }
   }
   terminate() {}
  }
  Object.defineProperty(window, 'Worker', { configurable: true, value: HarmlessWorker })
 })
 await page.route('**/rest/v1/master_games*', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
 })
 await page.route('**/storage/v1/object/public/master-games-pgn/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', body: pgn })
 })
 page.on('request', (request) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && request.url().includes('/rest/v1/')) {
   writes.push({ method: request.method(), url: request.url() })
  }
 })
}

async function openFreePlay(page) {
 await page.goto(`${baseUrl}/free-play/master-game/${fixture.slug}`, { waitUntil: 'networkidle' })
 await page.locator('.free-line-play-page__board-card [data-square="a1"]').waitFor({ state: 'visible' })
 await page.locator('[data-free-line-ply="99"]').waitFor({ state: 'visible' })
 await page.evaluate(() => {
  window.scrollTo(0, 0)
  const pageScroller = document.querySelector('.site-mobile-dock-scroll')
  if (pageScroller instanceof HTMLElement) pageScroller.scrollTop = 0
 })
}

async function selectPly(page, ply) {
 await page.locator(`[data-free-line-ply="${ply}"]`).evaluate((button) => button.click())
 await page.waitForFunction(
  ({ selectedPly, fen }) => {
   const board = document.querySelector('.free-line-play-page__board-card')
   return board?.getAttribute('data-free-line-current-ply') === String(selectedPly + 1)
    && board?.getAttribute('data-free-line-position') === fen
  },
  { selectedPly: ply, fen: expectedFens[ply] },
 )
 await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}

async function selectedGeometry(page, ply) {
 return page.locator(`[data-free-line-ply="${ply}"]`).evaluate((button) => {
  const list = button.closest('.free-line-play-page__move-list')
  if (!(list instanceof HTMLElement)) throw new Error('Free Play move-list container not found')
  const listRect = list.getBoundingClientRect()
  const buttonRect = button.getBoundingClientRect()
  return {
   active: button.getAttribute('aria-current'),
   inside: buttonRect.top >= listRect.top - 1 && buttonRect.bottom <= listRect.bottom + 1,
   scrollTop: list.scrollTop,
   scrollHeight: list.scrollHeight,
   clientHeight: list.clientHeight,
   windowScrollY: window.scrollY,
   pageScrollTop: document.querySelector('.site-mobile-dock-scroll')?.scrollTop ?? 0,
  }
 })
}

let browser
try {
 await waitForServer()
 browser = await chromium.launch({ headless: true })

 for (const viewport of [
  { width: 1920, height: 1080, name: 'wide desktop', fullSequence: true },
  { width: 1366, height: 768, name: 'desktop', fullSequence: false },
  { width: 390, height: 844, name: 'mobile', fullSequence: false },
 ]) {
  const writes = []
  const page = await browser.newPage({ viewport })
  await configurePage(page, writes)
  await openFreePlay(page)

  const playerBars = page.locator('[data-name="free-play-player-bar-aligned"]')
  assert.match(await playerBars.nth(0).textContent(), /Black Player[\s\S]*Black/, `${viewport.name}: Black remains above a White-oriented board`)
  assert.match(await playerBars.nth(1).textContent(), /White Player[\s\S]*White/, `${viewport.name}: White remains below a White-oriented board`)

  const targets = viewport.fullSequence ? [0, 1, 49, 89, 99] : [99]
  for (const ply of targets) {
   await selectPly(page, ply)
   assert.equal((await selectedGeometry(page, ply)).active, 'step', `${viewport.name}: ply ${ply} is highlighted`)
  }

  const finalGeometry = await selectedGeometry(page, 99)
  assert.ok(finalGeometry.scrollHeight > finalGeometry.clientHeight, `${viewport.name}: long move list is internally scrollable`)
  assert.ok(finalGeometry.inside && finalGeometry.scrollTop > 0, `${viewport.name}: final move is auto-followed`)
  assert.equal(finalGeometry.windowScrollY, 0, `${viewport.name}: browsing does not scroll the window`)
  assert.equal(finalGeometry.pageScrollTop, 0, `${viewport.name}: browsing does not scroll the page root`)
  assert.deepEqual(writes, [], `${viewport.name}: browsing introduces no progression writes`)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${viewport.name}: no horizontal overflow`)

  const boardBounds = await page.locator('.free-line-play-page__board-card [data-square]').evaluateAll((squares) => {
   const boxes = squares.map((square) => square.getBoundingClientRect())
   return { left: Math.min(...boxes.map((box) => box.left)), right: Math.max(...boxes.map((box) => box.right)) }
  })
  assert.ok(boardBounds.left >= -1 && boardBounds.right <= viewport.width + 1, `${viewport.name}: board retains its responsive width`)

  if (viewport.fullSequence) {
   await page.getByRole('button', { name: 'Restart Game', exact: true }).click()
   const board = page.locator('.free-line-play-page__board-card')
   assert.equal(await board.getAttribute('data-free-line-current-ply'), '0', 'Restart Game restores the initial ply')
   assert.equal(await board.getAttribute('data-free-line-position'), initialFen, 'Restart Game restores the initial position')
   assert.equal(await page.locator('[data-free-line-ply][aria-current="step"]').count(), 0, 'initial position has no falsely highlighted move')
  }

  await page.close()
 }

 console.log('PASS: Master Games Free Play supports exact 100-ply FEN browsing, active highlighting, internal auto-follow, responsive player/board layout, initial-position restart, and zero progress writes')
} finally {
 if (browser) await browser.close().catch(() => {})
 if (vite.exitCode == null) {
  vite.kill()
  await Promise.race([once(vite, 'exit'), new Promise((done) => setTimeout(done, 2_000))]).catch(() => {})
 }
}
