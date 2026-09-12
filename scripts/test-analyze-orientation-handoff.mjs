import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4212
const baseUrl = `http://${host}:${port}`
const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const pgn = `[Event "Analyze orientation regression"]
[White "Fischer, Robert James"]
[Black "Spassky, Boris V"]

1. Nf3 Nf6 2. Ng1 Ng8 *`
const fixture = {
 id: 999004,
 slug: 'analyze-orientation-regression',
 title: 'Fischer vs Spassky',
 white: 'Fischer, Robert James',
 black: 'Spassky, Boris V',
 event: 'Rendered QA',
 site: 'Local',
 year: 1972,
 round: '1',
 result: '*',
 opening: 'Knight development',
 eco: 'A00',
 description: 'Analyze orientation handoff fixture',
 pgn_storage_key: 'analyze-orientation-regression.pgn',
}

const sourceFiles = {
 context: await readFile(resolve(root, 'src/context/BoardUiContext.tsx'), 'utf8'),
 registration: await readFile(resolve(root, 'src/hooks/useRegisterPlayableBoard.ts'), 'utf8'),
 globalMenu: await readFile(resolve(root, 'src/components/GlobalFloatingPlay.tsx'), 'utf8'),
 analyze: await readFile(resolve(root, 'src/pages/analyze/AnalyzeBoardPage.tsx'), 'utf8'),
 masterGames: await readFile(resolve(root, 'src/MasterGamesPage.tsx'), 'utf8'),
 tactics: await readFile(resolve(root, 'src/trainers/patternTactic/PatternTacticTrainer.tsx'), 'utf8'),
 mates: await readFile(resolve(root, 'src/trainers/patternMate/PatternMateTrainer.tsx'), 'utf8'),
 masterTactics: await readFile(resolve(root, 'src/masterTactics/MasterTacticTrainer.tsx'), 'utf8'),
 masterMates: await readFile(resolve(root, 'src/masterMates/MasterMateTrainer.tsx'), 'utf8'),
 playComputer: await readFile(resolve(root, 'src/pages/PlayComputerPage.tsx'), 'utf8'),
}

assert.match(sourceFiles.context, /orientation\?: Side/, 'global board contract carries visible orientation')
assert.match(sourceFiles.registration, /orientation,\s*\n\s*suggestedColor:/, 'shared board registration publishes orientation')
assert.match(sourceFiles.globalMenu, /search\.set\("orientation", orientation\)/, 'Analyze URL contains explicit validated orientation')
assert.match(sourceFiles.globalMenu, /navigate\(buildAnalyzeUrl\(currentFen, boardState\.orientation\)\)/, 'Analyze uses SPA navigation and source orientation')
assert.match(sourceFiles.analyze, /value === "white" \|\| value === "black"/, 'Analyze validates orientation input')
assert.match(sourceFiles.analyze, /analyzeOrientationFromSearch\(window\.location\.search\) \?\? "white"/, 'Analyze initializes from explicit source orientation')
assert.match(sourceFiles.analyze, /fenFromUrl\.split\(" "\)\[1\] === "b" \? "black" : "white"/, 'direct FEN fallback remains side-to-move')
for (const [name, source] of [
 ['Master Games', sourceFiles.masterGames],
 ['regular Tactics', sourceFiles.tactics],
 ['regular Mates', sourceFiles.mates],
]) {
 assert.match(source, /orientation: boardOrientation/, `${name} registers its visible orientation`)
}
assert.match(sourceFiles.masterTactics, /PatternTacticTrainer/, 'Master Tactics reuses the orientation-aware tactic trainer')
assert.match(sourceFiles.masterMates, /PatternMateTrainer/, 'Master Mates reuses the orientation-aware mate trainer')
assert.match(sourceFiles.playComputer, /orientation: boardOrientation,\s*\n\s*suggestedColor: sideToMove\(position\)/, 'Play Computer preserves visible orientation independently of side to move')

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

async function configurePage(page, showCoordinates = true) {
 await page.addInitScript((coordinates) => {
  localStorage.setItem('weiss-chess-site-theme-v2', 'merida')
  localStorage.setItem('weiss-chess-show-board-coordinates-v1', String(coordinates))
 }, showCoordinates)
 await page.route('**/auth/v1/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: null }) })
 })
 await page.route('**/rest/v1/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
 })
 await page.route('**/rest/v1/master_games*', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
 })
 await page.route('**/storage/v1/object/public/master-games-pgn/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', body: pgn })
 })
}

async function renderedOrientation(page, boardId) {
 const board = page.locator(`[data-boardid="${boardId}"]`)
 await board.waitFor({ state: 'visible', timeout: 30_000 })
 return board.evaluate((element) => {
  const a1 = element.querySelector('[data-square="a1"]')?.getBoundingClientRect()
  const h8 = element.querySelector('[data-square="h8"]')?.getBoundingClientRect()
  if (!a1 || !h8) throw new Error('Orientation squares were not rendered')
  return a1.top > h8.top ? 'white' : 'black'
 })
}

async function clickGlobalAction(page, name, mobile) {
 if (mobile) {
  await page.locator('.global-mobile-nav').getByRole('button', { name, exact: true }).click()
  return
 }
 const menu = page.locator('.global-floating-play-desktop__menu')
 await menu.hover()
 const action = menu.locator('.global-floating-play-desktop__panel').getByRole('button', { name, exact: true })
 await action.waitFor({ state: 'visible' })
 await action.click()
}

async function openMasterGame(page) {
 await page.goto(`${baseUrl}/master-games/${fixture.slug}`, { waitUntil: 'domcontentloaded' })
 try {
  await page.locator('[data-boardid="master-games-board"]').waitFor({ state: 'visible', timeout: 30_000 })
 } catch {
  throw new Error(`Master Game orientation fixture did not render at ${page.url()}:\n${(await page.locator('body').innerText()).slice(0, 2500)}`)
 }
}

async function assertAnalyzeHandoff(browser, viewport, sourceOrientation, oppositeTurn = false) {
 const mobile = viewport.width <= 768
 const showCoordinates = sourceOrientation === 'white'
 const page = await browser.newPage({ viewport })
 await configurePage(page, showCoordinates)
 await openMasterGame(page)
 assert.equal(await renderedOrientation(page, 'master-games-board'), 'white', `${viewport.width}: Master Game begins White-bottom`)

 if (sourceOrientation === 'black') {
  await clickGlobalAction(page, 'Flip', mobile)
  assert.equal(await renderedOrientation(page, 'master-games-board'), 'black', `${viewport.width}: source flips Black-bottom`)
 } else if (oppositeTurn) {
  await page.getByRole('button', { name: 'Full line', exact: true }).click()
  await page.locator('[data-master-game-ply="0"]').click()
  await page.waitForFunction(() => document.querySelector('.master-games-trainer-board-frame')?.getAttribute('data-master-game-displayed-fen')?.split(' ')[1] === 'b')
  assert.equal(await renderedOrientation(page, 'master-games-board'), 'white', `${viewport.width}: source stays White-bottom when Black is to move`)
 }

 await clickGlobalAction(page, 'Analyze', mobile)
 await page.waitForURL((url) => url.pathname === '/analyze/board')
 assert.equal(new URL(page.url()).searchParams.get('orientation'), sourceOrientation, `${viewport.width}: handoff query carries source orientation`)
 assert.equal(await renderedOrientation(page, 'AnalyzeBoard'), sourceOrientation, `${viewport.width}: Analyze preserves ${sourceOrientation}-bottom`)
 assert.equal(await page.evaluate(() => localStorage.getItem('weiss-chess-site-theme-v2')), 'merida', `${viewport.width}: piece theme survives handoff`)
 assert.match(await page.locator('[data-boardid="AnalyzeBoard"] img').first().getAttribute('src') ?? '', /merida/i, `${viewport.width}: Analyze still renders Merida pieces`)
 assert.equal(await page.evaluate(() => localStorage.getItem('weiss-chess-show-board-coordinates-v1')), String(showCoordinates), `${viewport.width}: coordinate preference survives handoff`)
 const coordinateToggle = page.getByText('Show coordinates', { exact: true }).locator('..').locator('input[type="checkbox"]')
 assert.equal(await coordinateToggle.isChecked(), showCoordinates, `${viewport.width}: Analyze preserves coordinate visibility ${showCoordinates ? 'ON' : 'OFF'}`)

 await page.goBack({ waitUntil: 'domcontentloaded' })
 assert.equal(new URL(page.url()).pathname, `/master-games/${fixture.slug}`, `${viewport.width}: Back returns to source route without a loop`)
 await page.close()
}

async function assertSharedTrainerHandoff(browser, route, label) {
 const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
 await configurePage(page)
 await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
 const sourceBoard = page.locator('.trainer-shell-board-frame [data-boardid]').first()
 try {
  await sourceBoard.waitFor({ state: 'visible', timeout: 60_000 })
 } catch {
  throw new Error(`${label} source board did not render at ${route}:\n${(await page.locator('body').innerText()).slice(0, 2200)}`)
 }
 const boardId = await sourceBoard.getAttribute('data-boardid')
 assert.ok(boardId, `${label}: source board exposes a board id`)
 const initialOrientation = await renderedOrientation(page, boardId)
 await clickGlobalAction(page, 'Analyze', false)
 await page.waitForURL((url) => url.pathname === '/analyze/board')
 assert.equal(await renderedOrientation(page, 'AnalyzeBoard'), initialOrientation, `${label}: initial source orientation survives Analyze handoff`)

 await page.goBack({ waitUntil: 'domcontentloaded' })
 await page.locator(`[data-boardid="${boardId}"]`).waitFor({ state: 'visible', timeout: 60_000 })
 const restoredOrientation = await renderedOrientation(page, boardId)
 await clickGlobalAction(page, 'Flip', false)
 const flippedOrientation = restoredOrientation === 'white' ? 'black' : 'white'
 assert.equal(await renderedOrientation(page, boardId), flippedOrientation, `${label}: source board flips explicitly`)
 await clickGlobalAction(page, 'Analyze', false)
 await page.waitForURL((url) => url.pathname === '/analyze/board')
 assert.equal(await renderedOrientation(page, 'AnalyzeBoard'), flippedOrientation, `${label}: flipped source orientation survives Analyze handoff`)
 await page.close()
}

let browser
try {
 await waitForServer()
 browser = await chromium.launch({ headless: true })

 for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
 ]) {
  await assertAnalyzeHandoff(browser, viewport, 'white', true)
  await assertAnalyzeHandoff(browser, viewport, 'black')
 }

 for (const source of [
  { route: '/tactics/m1/bishop-pin', label: 'regular Tactics' },
  { route: '/mates/m1/back-rank', label: 'regular Mates' },
  { route: '/master-tactics/1/bishop-fork', label: 'Master Tactics' },
  { route: '/master-mates/1/smothered', label: 'Master Mates' },
 ]) {
  await assertSharedTrainerHandoff(browser, source.route, source.label)
 }

 const controls = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
 await configurePage(controls)
 const blackToMove = 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1'
 await controls.goto(`${baseUrl}/analyze/board?fen=${encodeURIComponent(blackToMove)}`, { waitUntil: 'domcontentloaded' })
 assert.equal(await renderedOrientation(controls, 'AnalyzeBoard'), 'black', 'direct FEN URL retains side-to-move fallback')

 await controls.goto(`${baseUrl}/analyze/board?fen=${encodeURIComponent(blackToMove)}&orientation=white`, { waitUntil: 'domcontentloaded' })
 assert.equal(await renderedOrientation(controls, 'AnalyzeBoard'), 'white', 'explicit source orientation wins over opposite side to move')
 await controls.getByRole('button', { name: 'Flip Board', exact: true }).click()
 assert.equal(await renderedOrientation(controls, 'AnalyzeBoard'), 'black', 'Flip Board remains authoritative')
 await controls.getByRole('button', { name: 'View White', exact: true }).click()
 assert.equal(await renderedOrientation(controls, 'AnalyzeBoard'), 'white', 'View White remains authoritative')
 await controls.getByRole('button', { name: 'View Black', exact: true }).click()
 assert.equal(await renderedOrientation(controls, 'AnalyzeBoard'), 'black', 'View Black remains authoritative')

 await controls.getByPlaceholder('Paste FEN or PGN here').fill(pgn)
 await controls.getByRole('button', { name: 'Load', exact: true }).click()
 await controls.getByText('PGN loaded:', { exact: false }).waitFor({ state: 'visible' })
 assert.equal(await renderedOrientation(controls, 'AnalyzeBoard'), 'black', 'PGN loading does not overwrite manual orientation')
 const navigation = controls.getByText('Move navigation', { exact: true }).locator('..')
 await navigation.getByRole('button', { name: 'Next', exact: true }).click()
 await controls.getByText('Ply 1 / 4', { exact: true }).waitFor({ state: 'visible' })
 assert.equal(await renderedOrientation(controls, 'AnalyzeBoard'), 'black', 'move navigation does not flip the board')
 const analyzeNow = controls.locator('button').filter({ hasText: /^Analyze Now$/ })
 assert.equal(await analyzeNow.count(), 1, `Analyze Now remains rendered:\n${(await controls.locator('body').innerText()).slice(-1800)}`)
 await analyzeNow.evaluate((button) => button.click())
 assert.equal(await renderedOrientation(controls, 'AnalyzeBoard'), 'black', 'Analyze Now does not flip the board')
 await controls.close()

 console.log('PASS: source-board Analyze handoff preserves White/Black orientation at desktop/mobile, source orientation beats side-to-move, direct links retain fallback, controls stay authoritative, and move/PGN/engine actions remain stable')
} finally {
 if (browser) await browser.close().catch(() => {})
 if (vite.exitCode == null) {
  vite.kill()
  await Promise.race([once(vite, 'exit'), new Promise((done) => setTimeout(done, 2_000))]).catch(() => {})
 }
}
