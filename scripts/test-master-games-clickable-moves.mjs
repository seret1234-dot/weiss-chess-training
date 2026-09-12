import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { Chess } from 'chess.js'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4198
const baseUrl = `http://${host}:${port}`
const pgn = `[Event "Master Games clickable moves regression"]
[White "White Player"]
[Black "Black Player"]

${Array.from({ length: 50 }, (_, index) => `${index + 1}. ${index % 2 === 0 ? 'Nf3 Nf6' : 'Ng1 Ng8'}`).join(' ')} *`
const fixture = {
 id: 999001,
 slug: 'clickable-moves-regression',
 title: 'Clickable Moves Regression',
 white: 'White Player',
 black: 'Black Player',
 event: 'Rendered QA',
 site: 'Local',
 year: 2026,
 round: '1',
 result: '*',
 opening: 'Knight repetition',
 eco: 'A00',
 description: 'Long rendered move-list fixture',
 pgn_storage_key: 'clickable-moves-regression.pgn',
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

async function openFullLine(page) {
 await page.goto(`${baseUrl}/master-games/${fixture.slug}`, { waitUntil: 'networkidle' })
 try {
  await page.locator('.master-games-trainer-board-frame [data-square="a1"]').waitFor({ state: 'visible', timeout: 10_000 })
 } catch {
  throw new Error(`Master Games fixture did not render:\n${(await page.locator('body').innerText()).slice(0, 2000)}`)
 }
 await page.getByRole('button', { name: 'Full line', exact: true }).click()
 await page.locator('[data-master-game-ply="99"]').waitFor({ state: 'visible' })
 await page.evaluate(() => {
  window.scrollTo(0, 0)
  const pageScroller = document.querySelector('.site-mobile-dock-scroll')
  if (pageScroller instanceof HTMLElement) pageScroller.scrollTop = 0
 })
}

async function selectPly(page, ply) {
 await page.locator(`[data-master-game-ply="${ply}"]`).evaluate((button) => button.click())
 await page.waitForFunction(
  ({ selectedPly, fen }) => {
   const frame = document.querySelector('.master-games-trainer-board-frame')
   return frame?.getAttribute('data-master-game-preview-ply') === String(selectedPly)
    && frame?.getAttribute('data-master-game-displayed-fen') === fen
  },
  { selectedPly: ply, fen: expectedFens[ply] },
 )
 await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}

async function activeMoveGeometry(page, ply) {
 return page.locator(`[data-master-game-ply="${ply}"]`).evaluate((button) => {
  const list = button.closest('.master-games-trainer-move-list--full')
  if (!(list instanceof HTMLElement)) throw new Error('Full line scroll container not found')
  const listRect = list.getBoundingClientRect()
  const buttonRect = button.getBoundingClientRect()
  return {
   active: button.getAttribute('aria-current'),
   inside: buttonRect.top >= listRect.top - 1 && buttonRect.bottom <= listRect.bottom + 1,
   scrollTop: list.scrollTop,
   scrollHeight: list.scrollHeight,
   clientHeight: list.clientHeight,
   pageScrollY: window.scrollY,
   pageScrollTop: document.querySelector('.site-mobile-dock-scroll')?.scrollTop ?? 0,
  }
 })
}

let browser
try {
 await waitForServer()
 browser = await chromium.launch({ headless: true })

 const writes = []
 const training = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
 await configurePage(training, writes)
 await openFullLine(training)

 const originalCounter = await training.getByText('0 / 5 fast runs', { exact: true }).textContent()
 const originalTimer = await training.locator('.master-games-trainer-timer').textContent()
 const expectedCard = training.getByText('Next expected move', { exact: true }).locator('..')
 assert.match(await expectedCard.textContent(), /Nf3/, 'training initially expects the first move')

 for (const ply of [0, 1, 49, 89, 99]) {
  await selectPly(training, ply)
  const frame = training.locator('.master-games-trainer-board-frame')
  assert.equal(await frame.getAttribute('data-master-game-training-ply'), '0', `previewing ply ${ply} does not advance training`)
  assert.equal((await activeMoveGeometry(training, ply)).active, 'step', `ply ${ply} is highlighted`)
  assert.match(await expectedCard.textContent(), /Nf3/, `previewing ply ${ply} preserves the expected training move`)
 }

 const finalGeometry = await activeMoveGeometry(training, 99)
 assert.ok(finalGeometry.scrollHeight > finalGeometry.clientHeight, 'long Full line remains internally scrollable')
 assert.ok(finalGeometry.inside && finalGeometry.scrollTop > 0, 'late selected move is auto-followed inside Full line')
 assert.equal(finalGeometry.pageScrollY, 0, 'move selection does not scroll the document')
 assert.equal(finalGeometry.pageScrollTop, 0, 'move selection does not scroll the page root')
 assert.equal(await training.getByText('0 / 5 fast runs', { exact: true }).textContent(), originalCounter, 'preview gives no fast-run credit')
 assert.equal(await training.locator('.master-games-trainer-timer').textContent(), originalTimer, 'preview does not complete or alter the timer')
 assert.deepEqual(writes, [], 'preview causes no Supabase progression writes')

 await training.getByRole('button', { name: 'Return to training', exact: true }).click()
 const frame = training.locator('.master-games-trainer-board-frame')
 assert.equal(await frame.getAttribute('data-master-game-preview-ply'), '', 'Return to training exits preview')
 assert.equal(await frame.getAttribute('data-master-game-displayed-fen'), initialFen, 'Return to training restores the authoritative board')
 assert.match(await expectedCard.textContent(), /Nf3/, 'Return to training preserves the expected move')

 await training.getByRole('button', { name: 'Restart Run', exact: true }).click()
 assert.equal(await frame.getAttribute('data-master-game-training-ply'), '0', 'Restart Run restores the stage ply')
 await training.getByRole('button', { name: 'Full line', exact: true }).click()
 await selectPly(training, 89)
 await training.getByRole('button', { name: 'Return to training', exact: true }).click()
 await training.getByRole('button', { name: 'Reset Stage', exact: true }).click()
 assert.equal(await frame.getAttribute('data-master-game-training-ply'), '0', 'Reset Stage restores the stage ply')

 await training.locator('.master-games-trainer-board-frame [data-square="g1"]').click()
 await training.locator('.master-games-trainer-board-frame [data-square="f3"]').click()
 await training.waitForFunction(() => document.querySelector('.master-games-trainer-board-frame')?.getAttribute('data-master-game-training-ply') === '1')
 assert.equal(await frame.getAttribute('data-master-game-displayed-fen'), expectedFens[0], 'normal exact-move training still updates the board')
 assert.match(await expectedCard.textContent(), /Nf6/, 'normal training advances to the next expected move')
 assert.equal(await training.locator('[data-master-game-ply="0"]').getAttribute('aria-current'), 'step', 'normal training progression keeps the move highlight synchronized')
 await training.close()

 for (const viewport of [
  { width: 1366, height: 768, name: 'desktop' },
  { width: 390, height: 844, name: 'mobile' },
 ]) {
  const page = await browser.newPage({ viewport })
  const viewportWrites = []
  await configurePage(page, viewportWrites)
  await openFullLine(page)
  await selectPly(page, 99)
  const geometry = await activeMoveGeometry(page, 99)
  assert.ok(geometry.inside, `${viewport.name}: active late move remains visible`)
  assert.ok(geometry.scrollHeight > geometry.clientHeight, `${viewport.name}: Full line is internally scrollable`)
 assert.equal(geometry.pageScrollY, 0, `${viewport.name}: selection does not scroll the document`)
  assert.equal(geometry.pageScrollTop, 0, `${viewport.name}: selection does not scroll the mobile page root`)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${viewport.name}: no horizontal overflow`)
  const board = await page.locator('.master-games-trainer-board-frame [data-square]').evaluateAll((squares) => {
   const boxes = squares.map((square) => square.getBoundingClientRect())
   const frame = squares[0]?.closest('.master-games-trainer-board-frame')
   return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
    right: Math.max(...boxes.map((box) => box.right)),
    bottom: Math.max(...boxes.map((box) => box.bottom)),
    scrollY: window.scrollY,
    frame: frame ? (() => {
     const box = frame.getBoundingClientRect()
     const style = getComputedStyle(frame)
     return { top: box.top, bottom: box.bottom, height: box.height, position: style.position, transform: style.transform }
    })() : null,
    ancestors: frame ? (() => {
     const result = []
     let element = frame.parentElement
     while (element && element !== document.body && result.length < 6) {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      result.push({ className: element.className, top: box.top, bottom: box.bottom, height: box.height, position: style.position, transform: style.transform, marginTop: style.marginTop })
      element = element.parentElement
     }
     return result
    })() : [],
   }
  })
  assert.ok(board.left >= -1 && board.right <= viewport.width + 1 && board.top >= -1, `${viewport.name}: board fits horizontally and starts on-screen (${JSON.stringify(board)})`)
  assert.deepEqual(viewportWrites, [], `${viewport.name}: preview causes no progression writes`)
  await page.close()
 }

 console.log('PASS: Master Games Full line moves are keyboard-accessible preview buttons with exact FEN selection, synchronized highlighting, internal auto-follow, and zero training credit')
} finally {
 if (browser) await browser.close().catch(() => {})
 if (vite.exitCode == null) {
  vite.kill()
  await Promise.race([once(vite, 'exit'), new Promise((done) => setTimeout(done, 2_000))]).catch(() => {})
 }
}
