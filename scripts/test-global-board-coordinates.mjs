import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4202
const baseUrl = `http://${host}:${port}`
const coordinateStorageKey = 'weiss-chess-show-board-coordinates-v1'
const themeStorageKey = 'weiss-chess-site-theme-v2'
const authStorageKey = 'sb-lahzgtcpbshmzsqoqswf-auth-token'

function authFixture() {
 const user = {
  id: '00000000-0000-4000-8000-000000000009',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'coordinates@example.com',
  user_metadata: { username: 'Coordinates Tester' },
  app_metadata: { provider: 'email', providers: ['email'] },
  created_at: '2026-01-01T00:00:00.000Z',
 }
 const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
 const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86_400 })}.test`
 return {
  user,
  session: {
   access_token: accessToken,
   refresh_token: `refresh-${user.id}`,
   expires_in: 86_400,
   expires_at: Math.floor(Date.now() / 1000) + 86_400,
   token_type: 'bearer',
   user,
  },
 }
}

async function collectTsx(directory) {
 const files = []
 for (const entry of await readdir(directory, { withFileTypes: true })) {
  if (entry.name === 'duplicate') continue
  const path = join(directory, entry.name)
  if (entry.isDirectory()) files.push(...await collectTsx(path))
  else if (entry.name.endsWith('.tsx')) files.push(path)
 }
 return files
}

const themeSource = await readFile(join(root, 'src/theme/ThemeContext.tsx'), 'utf8')
const boardSource = await readFile(join(root, 'src/theme/ThemedChessboard.tsx'), 'utf8')
const selectorSource = await readFile(join(root, 'src/theme/ThemeSelector.tsx'), 'utf8')
const floatingSource = await readFile(join(root, 'src/components/GlobalFloatingPlay.tsx'), 'utf8')
const accountSource = await readFile(join(root, 'src/AccountPage.tsx'), 'utf8')
const analyzeSource = await readFile(join(root, 'src/pages/analyze/AnalyzeBoardPage.tsx'), 'utf8')
const masterTacticSource = await readFile(join(root, 'src/masterTactics/MasterTacticTrainer.tsx'), 'utf8')
const masterMateSource = await readFile(join(root, 'src/masterMates/MasterMateTrainer.tsx'), 'utf8')
const masterGamesSource = await readFile(join(root, 'src/MasterGamesPage.tsx'), 'utf8')

assert.match(themeSource, /SHOW_BOARD_COORDINATES_STORAGE_KEY = "weiss-chess-show-board-coordinates-v1"/)
assert.match(themeSource, /DEFAULT_SHOW_BOARD_COORDINATES = true/)
assert.match(themeSource, /if \(saved === "false"\) return false/)
assert.match(themeSource, /if \(saved === "true"\) return true/)
assert.match(themeSource, /localStorage\.setItem\(SHOW_BOARD_COORDINATES_STORAGE_KEY, String\(showCoordinates\)\)/)
assert.match(boardSource, /showBoardNotation=\{showCoordinates && pageShowBoardNotation !== false\}/)
assert.match(selectorSource, /aria-label="Show coordinates"/)
assert.match(selectorSource, /setShowCoordinates\(event\.target\.checked\)/)
assert.match(floatingSource, /const \{ showCoordinates, toggleCoordinates \} = useSiteTheme\(\)/)
assert.equal((floatingSource.match(/onClick=\{toggleCoordinates\}/g) ?? []).length, 2, 'desktop and mobile quick controls share the global toggle')
assert.match(floatingSource, /Coordinates: \{showCoordinates \? "ON" : "OFF"\}/)
assert.match(floatingSource, /Coords: \{showCoordinates \? "ON" : "OFF"\}/)
assert.doesNotMatch(floatingSource, /localStorage|useState\([^)]*Coordinates/i, 'quick controls add no storage or second coordinate state')
assert.match(accountSource, /<ThemeSelector\s*\/>/, 'Account Settings owns the full display-preference selector')
assert.match(analyzeSource, /useSiteTheme\(\)/, 'Analyze reuses the global preference')
assert.doesNotMatch(analyzeSource, /const \[showCoordinates, setShowCoordinates\] = useState/, 'Analyze has no separate coordinate state')
assert.match(masterTacticSource, /<PatternTacticTrainer/, 'Master Tactics uses the shared regular trainer board')
assert.match(masterMateSource, /<PatternMateTrainer/, 'Master Mates uses the shared regular trainer board')
assert.match(masterGamesSource, /<ThemedChessboard/, 'Master Games Training and Free Play share the themed board')

const activeTsx = await collectTsx(join(root, 'src'))
const directBoardImports = []
for (const path of activeTsx) {
 const source = await readFile(path, 'utf8')
 if (/from\s+['"]react-chessboard['"]/.test(source)) directBoardImports.push(relative(root, path).replaceAll('\\', '/'))
}
assert.deepEqual(directBoardImports, ['src/theme/ThemedChessboard.tsx'], 'all active boards use the shared wrapper')

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
 throw new Error(`Vite preview did not become ready:\n${viteOutput}`)
}

async function configurePage(page, coordinateValue, auth = null) {
 await page.addInitScript(({ coordinateKey, themeKey, authKey, value, session }) => {
  if (sessionStorage.getItem('weiss-coordinate-test-seeded') === '1') return
  sessionStorage.setItem('weiss-coordinate-test-seeded', '1')
  localStorage.setItem(themeKey, 'classic')
  if (value === null) localStorage.removeItem(coordinateKey)
  else localStorage.setItem(coordinateKey, value)
  if (session) localStorage.setItem(authKey, JSON.stringify(session))
  else localStorage.removeItem(authKey)
 }, { coordinateKey: coordinateStorageKey, themeKey: themeStorageKey, authKey: authStorageKey, value: coordinateValue, session: auth?.session ?? null })

 await page.route('**/auth/v1/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(auth?.user ?? { user: null }) })
 })
 await page.route('**/rest/v1/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
 })
}

async function boardGeometry(page, id) {
 const board = page.locator(`[data-boardid="${id}"]`)
 await board.waitFor({ state: 'visible', timeout: 30_000 })
 return board.evaluate((element) => {
  const rect = element.getBoundingClientRect()
  return {
   width: rect.width,
   height: rect.height,
   documentWidth: document.documentElement.scrollWidth,
   viewportWidth: window.innerWidth,
  }
 })
}

async function squareText(page, id, square) {
 return page.locator(`[data-boardid="${id}"] [data-square="${square}"]`).textContent()
}

let browser
try {
 await waitForServer()
 browser = await chromium.launch({ headless: true })

 const preferenceContext = await browser.newContext({ viewport: { width: 1366, height: 768 } })
 const preferencePage = await preferenceContext.newPage()
 await configurePage(preferencePage, null)
 await preferencePage.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' })
 const toggle = preferencePage.getByLabel('Show coordinates', { exact: true })
 await toggle.waitFor({ state: 'visible' })
 assert.equal(await toggle.isChecked(), true, 'Account defaults Show coordinates to ON')
 const desktopMenu = preferencePage.getByRole('button', { name: 'Menu', exact: true })
 await desktopMenu.hover()
 const quickToggle = preferencePage.getByRole('button', { name: 'Coordinates on. Toggle board coordinates', exact: true })
 await quickToggle.click()
 assert.equal(await preferencePage.locator('.global-floating-play-desktop [aria-label$="Toggle board coordinates"]').getAttribute('aria-pressed'), 'false', 'quick control immediately reports OFF')
 assert.equal(await toggle.isChecked(), false, 'quick control immediately synchronizes Account Settings OFF')
 assert.equal(await preferencePage.evaluate((key) => localStorage.getItem(key), coordinateStorageKey), 'false')
 assert.equal(await preferencePage.evaluate((key) => localStorage.getItem(key), themeStorageKey), 'classic', 'coordinate toggle does not reset piece theme')
 await preferencePage.getByRole('button', { name: /^Merida / }).click()
 assert.equal(await preferencePage.evaluate((key) => localStorage.getItem(key), coordinateStorageKey), 'false', 'changing piece theme does not reset coordinate visibility')
 await preferencePage.getByRole('button', { name: /^Classic Refined original/ }).click()
 assert.equal(await preferencePage.evaluate((key) => localStorage.getItem(key), themeStorageKey), 'classic', 'Settings can still select an explicit piece theme')

 await preferencePage.goto(`${baseUrl}/sample-training`, { waitUntil: 'domcontentloaded' })
 const offGeometry = await boardGeometry(preferencePage, 'sample-training-board')
 assert.equal((await squareText(preferencePage, 'sample-training-board', 'a1'))?.trim(), '', 'OFF hides white-orientation labels')
 await preferencePage.reload({ waitUntil: 'domcontentloaded' })
 assert.equal((await squareText(preferencePage, 'sample-training-board', 'a1'))?.trim(), '', 'saved OFF survives reload')

 await preferencePage.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' })
 await desktopMenu.hover()
 const savedOffQuickToggle = preferencePage.getByRole('button', { name: 'Coordinates off. Toggle board coordinates', exact: true })
 assert.equal(await savedOffQuickToggle.getAttribute('aria-pressed'), 'false', 'saved OFF survives navigation and reload in the quick control')
 await toggle.check()
 await desktopMenu.hover()
 assert.equal(await preferencePage.locator('.global-floating-play-desktop [aria-label$="Toggle board coordinates"]').getAttribute('aria-pressed'), 'true', 'Account Settings immediately synchronizes quick control ON')
 assert.equal(await preferencePage.evaluate((key) => localStorage.getItem(key), coordinateStorageKey), 'true')
 await preferencePage.goto(`${baseUrl}/sample-training`, { waitUntil: 'domcontentloaded' })
 const onGeometry = await boardGeometry(preferencePage, 'sample-training-board')
 assert.equal((await squareText(preferencePage, 'sample-training-board', 'a1'))?.replace(/\s/g, ''), '1a', 'ON restores white-orientation labels')
 assert.ok(Math.abs(onGeometry.width - offGeometry.width) < 0.5 && Math.abs(onGeometry.height - offGeometry.height) < 0.5, 'coordinate toggle does not resize the board')

 await preferencePage.goto(`${baseUrl}/tactics/m1/bishop-pin`, { waitUntil: 'domcontentloaded' })
 await boardGeometry(preferencePage, 'tactic-bishop-pin-m1-board')
 assert.equal((await squareText(preferencePage, 'tactic-bishop-pin-m1-board', 'h8'))?.replace(/\s/g, ''), '8h', 'black orientation restores correctly oriented labels')
 await preferenceContext.close()

 const signedInContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
 const signedInPage = await signedInContext.newPage()
 const signedInAuth = authFixture()
 await configurePage(signedInPage, 'true', signedInAuth)
 await signedInPage.goto(`${baseUrl}/sample-training`, { waitUntil: 'domcontentloaded' })
 const accountLabel = signedInPage.locator('.global-account-label').filter({ hasText: 'Coordinates Tester' })
 await accountLabel.waitFor({ state: 'visible' })
 const signedInCoordinateControl = signedInPage.getByRole('button', { name: 'Coordinates on. Toggle board coordinates', exact: true })
 const [accountRect, coordinateRect] = await Promise.all([accountLabel.boundingBox(), signedInCoordinateControl.boundingBox()])
 assert.ok(accountRect && coordinateRect && coordinateRect.height >= 44, 'mobile quick control keeps a usable tap target')
 assert.ok(accountRect.y + accountRect.height <= coordinateRect.y || coordinateRect.y + coordinateRect.height <= accountRect.y, `mobile quick control does not overlap the username pill: account=${JSON.stringify(accountRect)} coordinates=${JSON.stringify(coordinateRect)}`)
 await signedInCoordinateControl.click()
 assert.equal((await squareText(signedInPage, 'sample-training-board', 'a1'))?.trim(), '', 'signed-in mobile quick control updates the shared board immediately')
 assert.equal(await signedInPage.evaluate((key) => localStorage.getItem(key), coordinateStorageKey), 'false', 'signed-in quick control persists through the same global key')
 await signedInContext.close()

 for (const viewport of [
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 1366, height: 768, name: '1366x768' },
  { width: 390, height: 844, name: '390x844' },
 ]) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  await configurePage(page, 'true')
  await page.goto(`${baseUrl}/sample-training`, { waitUntil: 'domcontentloaded' })
  const visible = await boardGeometry(page, 'sample-training-board')
  assert.equal((await squareText(page, 'sample-training-board', 'a1'))?.replace(/\s/g, ''), '1a', `${viewport.name}: coordinates visible`)
  const quickControl = viewport.width <= 768
   ? page.getByRole('button', { name: 'Coordinates on. Toggle board coordinates', exact: true })
   : page.getByRole('button', { name: 'Menu', exact: true })
  if (viewport.width > 768) {
   await quickControl.hover()
  }
  const coordinateControl = page.getByRole('button', { name: 'Coordinates on. Toggle board coordinates', exact: true })
  await coordinateControl.click()
  assert.equal((await squareText(page, 'sample-training-board', 'a1'))?.trim(), '', `${viewport.name}: quick control immediately hides coordinates`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const hidden = await boardGeometry(page, 'sample-training-board')
  assert.equal((await squareText(page, 'sample-training-board', 'a1'))?.trim(), '', `${viewport.name}: coordinates hidden`)
  if (viewport.width > 768) await page.getByRole('button', { name: 'Menu', exact: true }).hover()
  assert.equal(await page.getByRole('button', { name: 'Coordinates off. Toggle board coordinates', exact: true }).getAttribute('aria-pressed'), 'false', `${viewport.name}: quick control preserves OFF after reload`)
  assert.ok(Math.abs(visible.width - hidden.width) < 0.5 && Math.abs(visible.height - hidden.height) < 0.5, `${viewport.name}: board dimensions unchanged`)
  assert.ok(visible.documentWidth <= visible.viewportWidth + 1 && hidden.documentWidth <= hidden.viewportWidth + 1, `${viewport.name}: no horizontal overflow`)
  await context.close()
 }

 console.log('PASS: global board coordinates default, logged-out/logged-in quick controls, Account toggle, persistence, white/black orientation, shared board coverage, responsive dimensions, and independent piece-theme preference')
} finally {
 await browser?.close()
 vite.kill()
}
