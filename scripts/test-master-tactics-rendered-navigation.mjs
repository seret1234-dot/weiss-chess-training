import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const vitePort = 4191
const proxyPort = 4192
const viteUrl = `http://${host}:${vitePort}`
const baseUrl = `http://${host}:${proxyPort}`
const masterUrlMarker = '/storage/v1/object/public/master-puzzles/v1/v1/'
const masterDataRoot = resolve(root, 'public/data/master-puzzles/v1')
await access(chromium.executablePath())

const promotionIndex = JSON.parse(await readFile(join(masterDataRoot, 'indexes', 'tactics-course-1-promotion.json'), 'utf8'))
const promotionRef = promotionIndex.refs[0]
const promotionShard = JSON.parse(await readFile(join(masterDataRoot, 'puzzles', `chunk-${String(promotionRef.chunk).padStart(5, '0')}.json`), 'utf8'))
const promotionPuzzle = promotionShard.puzzles.find((puzzle) => puzzle.id === promotionRef.id)
const promotionMove = promotionPuzzle?.solution?.find((move) => move.side === 'learner')?.uci
assert.match(promotionMove || '', /^[a-h][1-8][a-h][18][qrbn]$/, 'promotion fixture has a legal learner promotion move')

const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', host, '--port', String(vitePort), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let viteOutput = ''
vite.stdout.on('data', (chunk) => { viteOutput += chunk })
vite.stderr.on('data', (chunk) => { viteOutput += chunk })

async function waitForServer() {
 const deadline = Date.now() + 30_000
 while (Date.now() < deadline) {
  try { const response = await fetch(viteUrl); if (response.ok) return } catch {}
  await new Promise((done) => setTimeout(done, 100))
 }
 throw new Error(`Vite did not become ready:\n${viteOutput}`)
}

function createProxy() {
 return createServer((clientRequest, clientResponse) => {
  const upstreamRequest = request({ hostname: host, port: vitePort, path: clientRequest.url, method: clientRequest.method, headers: clientRequest.headers }, (upstreamResponse) => {
   const headers = { ...upstreamResponse.headers }
   delete headers['cross-origin-opener-policy']
   delete headers['cross-origin-embedder-policy']
   clientResponse.writeHead(upstreamResponse.statusCode ?? 502, headers)
   upstreamResponse.pipe(clientResponse)
  })
  upstreamRequest.on('error', (error) => clientResponse.destroy(error))
  clientRequest.pipe(upstreamRequest)
 })
}

async function installMasterDataRoute(page, requests) {
 await page.route(`**${masterUrlMarker}**`, async (route) => {
  const url = route.request().url()
 const relative = decodeURIComponent(url.split(masterUrlMarker)[1].split('?')[0])
 requests.push(relative)
  const body = relative === 'indexes/mixed-distance-2.json'
   ? Buffer.from(JSON.stringify({ distance: 2, refs: [{ id: 'mtc2_00014c3110485f6dc0d04f53ab5e8467d1a04bd84cfb3621aa478b63efc4ee52', chunk: 0 }] }))
   : await readFile(join(masterDataRoot, ...relative.split('/')))
  await route.fulfill({ status: 200, contentType: 'application/json', body })
 })
}

async function expectPath(page, pathname) {
 await page.waitForURL((url) => url.pathname === pathname)
 assert.equal(new URL(page.url()).pathname, pathname)
}

async function expectTrainer(page, titlePattern) {
 await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 60_000 })
 await page.locator('.trainer-shell-title').filter({ hasText: titlePattern }).waitFor({ state: 'visible', timeout: 60_000 })
 assert.equal(await page.getByText('Loading puzzles...', { exact: true }).count(), 0)
 assert.equal(await page.locator('[data-testid="pattern-tactic-load-error"]').count(), 0)
 assert.equal(await page.getByText('Master game', { exact: true }).count(), 1)
}

async function expectChunkUi(page) {
 await page.getByText('Chunk mastery', { exact: true }).waitFor({ state: 'visible', timeout: 60_000 })
 await page.getByText('Chunk navigation', { exact: true }).waitFor({ state: 'visible', timeout: 60_000 })
 await page.getByText('This puzzle', { exact: true }).waitFor({ state: 'visible' })
 assert.equal(await page.getByText(/0 \/ 5 fast solves/).count(), 1, 'current-puzzle mastery squares must retain their five-solve model')
 const navigationCard = page.getByText('Chunk navigation', { exact: true }).locator('..')
 assert.equal(await navigationCard.getByRole('button', { name: 'Previous', exact: true }).count(), 1)
 assert.equal(await navigationCard.getByRole('button', { name: 'Next', exact: true }).count(), 1)
 assert.equal(await navigationCard.getByRole('button', { name: 'Jump', exact: true }).count(), 1)
 return navigationCard
}

async function verifyChunkSwitchAndReload(page, storageKeyPrefix) {
 const navigationCard = await expectChunkUi(page)
 const firstChunkLabel = page.getByText(/^Chunk 1 \/ \d+$/, { exact: true }).last()
 await firstChunkLabel.waitFor({ state: 'visible' })
 await navigationCard.getByRole('button', { name: 'Next', exact: true }).click()
 await page.getByText(/^Chunk 2 \/ \d+$/, { exact: true }).last().waitFor({ state: 'visible', timeout: 60_000 })
 const savedAfterNext = await page.evaluate((prefix) => {
  const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).find((candidate) => candidate?.startsWith(prefix))
  return { key, state: JSON.parse((key && localStorage.getItem(key)) || '{}') }
 }, storageKeyPrefix)
 assert.ok(savedAfterNext.key, `manual Next writes the ${storageKeyPrefix} namespace`)
 assert.equal(savedAfterNext.state.currentChunkIndex, 1, 'manual Next persists the selected chunk')
 await page.reload({ waitUntil: 'commit' })
 await page.getByText(/^Chunk 2 \/ \d+$/, { exact: true }).last().waitFor({ state: 'visible', timeout: 60_000 })
 const restoredNavigation = page.getByText('Chunk navigation', { exact: true }).locator('..')
 await restoredNavigation.getByRole('button', { name: 'Previous', exact: true }).click()
 await page.getByText(/^Chunk 1 \/ \d+$/, { exact: true }).last().waitFor({ state: 'visible', timeout: 60_000 })
}

async function expectMobileChunkTrainerFits(page, path) {
 await page.goto(`${baseUrl}${path}`, { waitUntil: 'commit' })
 await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 60_000 })
 assert.equal(await page.getByText('Loading puzzles...', { exact: true }).count(), 0)
 await expectChunkUi(page)
 const board = page.locator('.trainer-shell-board-frame')
 await board.waitFor({ state: 'visible' })
 const box = await board.boundingBox()
 assert.ok(box && box.width <= 390 && box.x >= 0 && box.x + box.width <= 391, `${path} board must fit the mobile viewport`)
 assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${path} trainer and chunk controls must not overflow horizontally`)
}

async function clickSquare(page, square, orientation = 'white') {
 const board = page.locator('.trainer-shell-custom-board-slot').first()
 const box = await board.boundingBox()
 assert.ok(box && box.width > 300 && box.height > 300, 'Rendered chessboard must have measurable dimensions')
 const file = square.charCodeAt(0) - 97
 const rank = Number(square[1])
 const displayFile = orientation === 'white' ? file : 7 - file
 const displayRank = orientation === 'white' ? 8 - rank : rank - 1
 await page.mouse.click(box.x + (displayFile + 0.5) * box.width / 8, box.y + (displayRank + 0.5) * box.height / 8)
}

let browser
let proxy
const errors = []
const desktopRequests = []
try {
 await waitForServer()
 proxy = createProxy()
 await new Promise((done, reject) => { proxy.once('error', reject); proxy.listen(proxyPort, host, done) })
 browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() })

 const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
 const page = await desktop.newPage()
 page.on('pageerror', (error) => errors.push(error.message))
 page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`) })
 page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text())
 })
 await page.route('**/api/coach-explanation', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ explanation: 'Rendered test explanation.' }) }))
 await installMasterDataRoute(page, desktopRequests)
 await page.goto(baseUrl, { waitUntil: 'commit' })
 await page.getByRole('button', { name: /Master Tactics/ }).click()
 await expectPath(page, '/master-tactics')
 await page.getByRole('link', { name: /Tactic in 2/ }).click()
 await expectPath(page, '/master-tactics/2')
 const bishopForkCard = page.getByRole('link', { name: /Bishop Fork/ })
 await bishopForkCard.waitFor({ state: 'visible', timeout: 60_000 })
 assert.equal(await bishopForkCard.count(), 1)
 await bishopForkCard.click()
 await expectPath(page, '/master-tactics/2/bishop-fork')
 await expectTrainer(page, 'Bishop Fork')
 await verifyChunkSwitchAndReload(page, 'pattern_tactic_progress_master-tactics:2:bishop-fork_v1')
 assert.equal(await page.locator('.trainer-shell-board-top').count(), 1)
 assert.equal(await page.locator('.trainer-shell-board-bottom').count(), 1)
 assert.equal(await page.getByText(/Played in the game:/).count(), 0, 'Historical SAN must be hidden before solve')
 assert.equal(await page.getByRole('button', { name: 'Go back' }).count(), 0, 'Global Back must not duplicate hierarchy Back')
 await clickSquare(page, 'c3')
 await clickSquare(page, 'b2')
 await page.getByText('Wrong move', { exact: true }).waitFor({ state: 'visible' })
 await page.reload({ waitUntil: 'commit' })
 await expectTrainer(page, 'Bishop Fork')
 await clickSquare(page, 'c3')
 await clickSquare(page, 'f6')
 await page.getByText('Find move 2 of 2', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
 await clickSquare(page, 'f6')
 await clickSquare(page, 'h4')
 await page.getByText('Correct', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
 await page.getByText('Played in the game: Bf6+', { exact: true }).waitFor({ state: 'visible' })
 const progressKeys = await page.evaluate(() => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean))
 assert.ok(progressKeys.includes('pattern_tactic_progress_master-tactics:2:bishop-fork_v1'), 'Master Tactics progress key must be course-specific')
 assert.ok(!progressKeys.some((key) => key.startsWith('pattern_tactic_progress_tactic-bishop-fork-')), 'Master solve must not write regular Tactics progress')
 await page.getByRole('button', { name: /Back/ }).click()
 await expectPath(page, '/master-tactics/2')
 await page.getByRole('button', { name: /Back to Master Tactics/ }).click()
 await expectPath(page, '/master-tactics')
 await page.getByRole('button', { name: /Back to Home/ }).click()
 await expectPath(page, '/')

 await page.goto(`${baseUrl}/master-tactics/2/bishop-fork`, { waitUntil: 'commit' })
 await expectTrainer(page, 'Bishop Fork')
 await page.getByRole('button', { name: /Back/ }).click()
 await expectPath(page, '/master-tactics/2')

 const beforeMixed = desktopRequests.length
 await page.goto(`${baseUrl}/master-tactics/1/mixed`, { waitUntil: 'commit' })
 await expectTrainer(page, 'Mixed')
 await expectChunkUi(page)
 const mixedRequests = desktopRequests.slice(beforeMixed)
 assert.ok(mixedRequests.includes('indexes/mixed-distance-1.json'))
 assert.ok(!mixedRequests.some((path) => path.startsWith('indexes/tactics-course-1-')))

 const masterRequests = desktopRequests.filter((path) => path.endsWith('.json'))
 assert.ok(masterRequests.includes('catalog.json'))
 assert.ok(masterRequests.includes('indexes/tactics-course-2-bishop-fork.json'))
 assert.ok(masterRequests.some((path) => /^puzzles\/chunk-\d{5}\.json$/.test(path)))
 assert.ok(!masterRequests.includes('puzzles.json'))
 assert.ok(!masterRequests.some((path) => path.startsWith('indexes/tactics-course-') && !path.includes('2-bishop-fork')))
 assert.ok(new Set(masterRequests.filter((path) => path.startsWith('puzzles/'))).size < 100, 'Only current virtual chunks may fetch canonical shards')

 await page.goto(`${baseUrl}/master-tactics/2/mixed`, { waitUntil: 'commit' })
 await expectTrainer(page, 'Mixed')
 await clickSquare(page, 'd8', 'black')
 await clickSquare(page, 'd4', 'black')
 await page.getByText('Find move 2 of 2', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
 await clickSquare(page, 'a8', 'black')
 await clickSquare(page, 'd8', 'black')
 await page.getByText('Correct', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })

await page.goto(`${baseUrl}/master-tactics/1/promotion`, { waitUntil: 'commit' })
await expectTrainer(page, 'Promotion')
await page.getByText('Keyboard move controls', { exact: true }).click()
await page.getByLabel('From square').fill(promotionMove.slice(0, 2))
await page.getByRole('button', { name: 'Select source' }).click()
await page.getByLabel('To square').fill(promotionMove.slice(2, 4))
await page.getByRole('button', { name: 'Make move' }).click()
 const promotionDialog = page.getByRole('dialog', { name: 'Promote pawn to' })
 await promotionDialog.waitFor({ state: 'visible' })
 for (const piece of ['Queen', 'Rook', 'Bishop', 'Knight']) assert.equal(await page.getByRole('button', { name: `Promote to ${piece}` }).count(), 1)
 await page.getByRole('button', { name: 'Promote to Queen' }).click()
 await page.getByText('Correct', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })

 await page.goto(`${baseUrl}/tactics`, { waitUntil: 'commit' })
 await page.getByRole('link', { name: /Tactic in 1/ }).first().waitFor({ state: 'visible' })
 await page.goto(`${baseUrl}/tactics/m1/bishop-fork`, { waitUntil: 'commit' })
 await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 60_000 })
 await verifyChunkSwitchAndReload(page, 'pattern_tactic_progress_tactic-bishop-fork-m1')
 assert.equal(await page.getByText('Master game', { exact: true }).count(), 0, 'Regular Tactics must not render Master provenance')
 assert.equal(await page.locator('.trainer-shell-board-top').count(), 0, 'Regular Tactics must not render Master player labels')
 await page.goto(`${baseUrl}/mates/m1/smothered`, { waitUntil: 'commit' })
 await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 60_000 })
 await verifyChunkSwitchAndReload(page, 'pattern_mate_progress_smothered-mate-1')
 assert.equal(await page.getByText('Master game', { exact: true }).count(), 0, 'Regular Mates must not render Master provenance')

 await page.goto(`${baseUrl}/master-mates/1/smothered`, { waitUntil: 'commit' })
 await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 60_000 })
 await expectChunkUi(page)
 assert.equal(await page.getByText('Master game', { exact: true }).count(), 1, 'Master Mates provenance must remain present')
 assert.equal(await page.locator('.trainer-shell-board-top').count(), 1, 'Master Mates player labels must remain present')
 await page.goto(`${baseUrl}/master-mates/1/mixed`, { waitUntil: 'commit' })
 await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 60_000 })
 await verifyChunkSwitchAndReload(page, 'pattern_mate_progress_master-mates:1:mixed_v1')
 await page.goto(`${baseUrl}/master-mates/1/kill-box`, { waitUntil: 'commit' })
 const masterAdjacentRook = page.getByRole('button', { name: /Adjacent Rook/ })
 await masterAdjacentRook.waitFor({ state: 'visible', timeout: 60_000 })
 await masterAdjacentRook.click()
 await expectPath(page, '/master-mates/1/kill-box-adjacent-rook')
 await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 60_000 })
 await expectChunkUi(page)
 await page.getByRole('button', { name: /Back/ }).click()
 await expectPath(page, '/master-mates/1/kill-box')
 await desktop.close()

 const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
 const mobilePage = await mobile.newPage()
 await installMasterDataRoute(mobilePage, [])
 for (const path of [
  '/tactics/m1/bishop-fork',
  '/mates/m1/smothered',
  '/master-tactics/2/bishop-fork',
  '/master-mates/1/smothered',
  '/master-tactics/1/mixed',
 ]) await expectMobileChunkTrainerFits(mobilePage, path)
 await mobile.close()

 await page?.close().catch(() => {})
 assert.deepEqual(errors, [])
 console.log(JSON.stringify({ desktop: 'passed', mobile: 'passed', masterRequests: [...new Set(masterRequests)], result: 'Rendered Master Tactics hierarchy, trainer, provenance and lazy-loading passed' }))
} finally {
 if (browser) await browser.close().catch(() => {})
 if (proxy) { proxy.close(); await once(proxy, 'close').catch(() => {}) }
 if (vite.exitCode == null) {
  vite.kill()
  await Promise.race([once(vite, 'exit'), new Promise((done) => setTimeout(done, 2_000))]).catch(() => {})
 }
}
