import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { once } from 'node:events'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4195
const baseUrl = `http://${host}:${port}`
const masterDataRoot = resolve(root, 'public/data/master-puzzles/v1')
const externalMarker = '/storage/v1/object/public/master-puzzles/v1/v1/'
const localMarker = '/data/master-puzzles/v1/'

await access(chromium.executablePath())
const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', host, '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let viteOutput = ''
vite.stdout.on('data', (chunk) => { viteOutput += chunk })
vite.stderr.on('data', (chunk) => { viteOutput += chunk })

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try { if ((await fetch(baseUrl)).ok) return } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Vite preview did not become ready:\n${viteOutput}`)
}

async function installMasterCorpusRoute(page) {
  const handler = async (route, marker) => {
    const relative = decodeURIComponent(route.request().url().split(marker)[1].split('?')[0])
    const body = await readFile(join(masterDataRoot, ...relative.split('/')))
    await route.fulfill({ status: 200, contentType: 'application/json', body })
  }
  await page.route(`**${externalMarker}**`, (route) => handler(route, externalMarker))
  await page.route(`**${localMarker}**`, (route) => handler(route, localMarker))
}

const cases = [
  { name: 'regular Tactics', path: '/tactics/m1/bishop-fork', keyPrefix: 'pattern_tactic_progress_tactic-bishop-fork-m1' },
  { name: 'regular Mates large course', path: '/mates/m1/back-rank', keyPrefix: 'pattern_mate_progress_back-rank-mate-1' },
  { name: 'Master Tactics', path: '/master-tactics/2/bishop-fork', keyPrefix: 'pattern_tactic_progress_master-tactics:2:bishop-fork' },
  { name: 'Master Mates', path: '/master-mates/1/smothered', keyPrefix: 'pattern_mate_progress_master-mates:1:smothered' },
]

async function readCourseSnapshot(page, keyPrefix) {
  return page.evaluate((prefix) => {
    const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).find((candidate) => candidate?.startsWith(prefix))
    return { key, state: key ? JSON.parse(localStorage.getItem(key) ?? '{}') : null }
  }, keyPrefix)
}

async function assertFirstPosition(page, label, chunkNumber) {
  await page.getByText(new RegExp(`^Chunk ${chunkNumber} \\/ \\d+$`), { exact: true }).last().waitFor({ state: 'visible', timeout: 60_000 })
  await page.getByText(/^Puzzle 1 \/ \d+$/, { exact: true }).first().waitFor({ state: 'visible', timeout: 60_000 })
  assert.equal(await page.getByText(/0 \/ 5 fast solves/).count(), 1, `${label}: current puzzle mastery resets visually`)
}

async function exerciseReset(page, testCase, viewportLabel) {
  console.log(`${viewportLabel} ${testCase.name}: starting`)
  await page.goto(`${baseUrl}${testCase.path}`, { waitUntil: 'commit' })
  await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 60_000 })
  await page.getByText('Chunk navigation', { exact: true }).waitFor({ state: 'visible', timeout: 60_000 })
  const restart = page.getByRole('button', { name: 'Restart progression', exact: true })
  await restart.waitFor({ state: 'visible' })

  // This is a rendered reset test, not a navigation test. Stay on the
  // currently loaded chunk and prove that the visible current progression is
  // cleared immediately and remains cleared after reload.
  const seeded = await page.evaluate(({ prefix }) => {
    const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).find((candidate) => candidate?.startsWith(prefix))
    if (!key) return null
    const state = JSON.parse(localStorage.getItem(key) ?? '{}')
    state.currentChunkIndex = 0
    state.currentPuzzleIndex = 1
    const realChunkFile = Object.keys(state.chunkProgressByFile ?? {}).filter((fileName) => !fileName.includes('-stale')).at(-1)
    if (realChunkFile) {
      state.chunkProgressByFile[realChunkFile][0] = 5
      state.chunkProgressByFile[realChunkFile][1] = 4
    }
    state.chunkProgressByFile = {
      ...(state.chunkProgressByFile ?? {}),
      'chunk-001-stale.json': [{ fastSolves: 5 }],
      'chunk-010-stale.json': [{ fastSolves: 5 }],
      'chunk-050-stale.json': [{ fastSolves: 5 }],
    }
    localStorage.setItem(key, JSON.stringify(state))
    localStorage.setItem('weiss_piece_theme', 'classic')
    localStorage.setItem('weiss_board_coordinates', 'false')
    localStorage.setItem('restart-test-unrelated', 'preserve')
    return key
  }, { prefix: testCase.keyPrefix })
  assert.ok(seeded, `${viewportLabel} ${testCase.name}: active course storage key exists`)
  await page.reload({ waitUntil: 'commit' })
  await page.getByText(/^Puzzle 2 \/ \d+$/, { exact: true }).first().waitFor({ state: 'visible', timeout: 60_000 })
  await page.getByText(/4 \/ 5 fast solves/).waitFor({ state: 'visible', timeout: 60_000 })

  const button = page.getByRole('button', { name: 'Restart progression', exact: true })
  await button.scrollIntoViewIfNeeded()
  await button.click()
  const expectedChunkIndex = 0
  await assertFirstPosition(page, `${viewportLabel} ${testCase.name} immediately after reset`, expectedChunkIndex + 1)
  assert.equal(await page.evaluate(() => localStorage.getItem('weiss_piece_theme')), 'classic')
  assert.equal(await page.evaluate(() => localStorage.getItem('weiss_board_coordinates')), 'false')
  assert.equal(await page.evaluate(() => localStorage.getItem('restart-test-unrelated')), 'preserve')

  const immediate = await readCourseSnapshot(page, testCase.keyPrefix)
  if (immediate.state) {
    assert.equal(immediate.state.currentChunkIndex, expectedChunkIndex, `${viewportLabel} ${testCase.name}: current chunk is preserved while its progress resets`)
    assert.equal(immediate.state.currentPuzzleIndex, 0, `${viewportLabel} ${testCase.name}: saved puzzle is reset`)
    assert.equal(Object.keys(immediate.state.chunkProgressByFile ?? {}).some((key) => key.includes('-stale')), true, `${viewportLabel} ${testCase.name}: unrelated chunk counters are preserved`)
  }

  await page.reload({ waitUntil: 'commit' })
  await assertFirstPosition(page, `${viewportLabel} ${testCase.name} after reload`, expectedChunkIndex + 1)
  const afterReload = await readCourseSnapshot(page, testCase.keyPrefix)
  assert.ok(afterReload.key, `${viewportLabel} ${testCase.name}: clean initial state is persisted after reload`)
  assert.equal(afterReload.state.currentChunkIndex, expectedChunkIndex)
  assert.equal(afterReload.state.currentPuzzleIndex, 0)
  assert.equal(Object.keys(afterReload.state.chunkProgressByFile ?? {}).some((key) => key.includes('-stale')), true, `${viewportLabel} ${testCase.name}: unrelated chunk state survives reload`)
  assert.equal(await page.getByRole('button', { name: 'Restart progression', exact: true }).isEnabled(), true, `${viewportLabel} ${testCase.name}: button is re-enabled`)
  console.log(`${viewportLabel} ${testCase.name}: restart + reload passed`)
}

let browser
const pageErrors = []
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() })
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    page.on('pageerror', (error) => pageErrors.push(`${viewport.width}x${viewport.height}: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') console.log(`${viewport.width}x${viewport.height} browser error: ${message.text()}`)
    })
    await installMasterCorpusRoute(page)
    for (const testCase of cases) await exerciseReset(page, testCase, `${viewport.width}x${viewport.height}`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${viewport.width}x${viewport.height}: trainer remains horizontally contained`)
    await context.close()
  }
  assert.deepEqual(pageErrors, [])
  console.log('Rendered Restart Progression QA passed at 1920x1080 and 390x844 for regular Tactics, regular Mates, Master Tactics, and Master Mates.')
} finally {
  if (browser) await browser.close().catch(() => {})
  if (vite.exitCode == null) {
    vite.kill()
    await Promise.race([once(vite, 'exit'), new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000))]).catch(() => {})
  }
}
