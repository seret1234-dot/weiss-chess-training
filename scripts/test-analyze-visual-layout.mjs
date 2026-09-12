import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4197
const baseUrl = `http://${host}:${port}`
const fen = 'r2q1rk1/pp1nbppp/2p1pn2/3p4/3P4/2NBPN2/PPQ2PPP/R1B2RK1 w - - 2 10'
const longPgn = `[Event "Move follow regression"]
[White "White Player"]
[Black "Black Player"]

${Array.from({ length: 50 }, (_, index) => `${index + 1}. ${index % 2 === 0 ? 'Nf3 Nf6' : 'Ng1 Ng8'}`).join(' ')} *`
const source = await readFile(resolve(root, 'src/pages/analyze/AnalyzeBoardPage.tsx'), 'utf8')

assert.match(source, /if \(label === "Inspired"\) return "\\u2605";/, 'Inspired uses an encoding-stable star glyph')
assert.doesNotMatch(source, /â˜…|\uFFFD/, 'Analyze source contains no corrupt Inspired/replacement glyph')

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

function overlaps(a, b) {
 return a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1
}

async function moveVisibility(page, ply) {
 return page.locator(`[data-analyze-ply="${ply}"]`).evaluate((activeMove) => {
  const list = activeMove.closest('.analyze-moves-list')
  if (!(list instanceof HTMLElement)) throw new Error('Moves list container not found')
  const listRect = list.getBoundingClientRect()
  const activeRect = activeMove.getBoundingClientRect()
  return {
   inside: activeRect.top >= listRect.top - 1 && activeRect.bottom <= listRect.bottom + 1,
   scrollTop: list.scrollTop,
   scrollHeight: list.scrollHeight,
   clientHeight: list.clientHeight,
   pageScrollY: window.scrollY,
  }
 })
}

async function clickMoveNavigation(page, name) {
 const button = page.getByText('Move navigation', { exact: true }).locator('..').getByRole('button', { name, exact: true })
 await button.evaluate((element) => element.click())
}

async function waitForPly(page, ply) {
 await page.getByText(`Ply ${ply} / 100`, { exact: true }).waitFor({ state: 'visible' })
 await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))))
}

async function verifyMoveFollow(page, viewportName, exerciseSteps = false) {
 await page.goto(`${baseUrl}/analyze/board?fen=${encodeURIComponent(fen)}`, { waitUntil: 'networkidle' })
 await page.getByPlaceholder('Paste FEN or PGN here').fill(longPgn)
 await page.getByRole('button', { name: 'Load', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'PGN loaded:' }).waitFor({ state: 'visible' })
 await page.evaluate(() => window.scrollTo(0, 0))
 await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))))
 const initialPageScroll = await page.evaluate(() => window.scrollY)

 await clickMoveNavigation(page, 'Last')
 await waitForPly(page, 100)
 const last = await moveVisibility(page, 100)
 assert.ok(last.scrollHeight > last.clientHeight + 1, `${viewportName}: long Moves list remains internally scrollable`)
 assert.ok(last.inside, `${viewportName}: Last keeps the final move inside the Moves viewport`)
 assert.ok(last.scrollTop > 0, `${viewportName}: Last advances the Moves container scroll position`)
 assert.equal(last.pageScrollY, initialPageScroll, `${viewportName}: Last does not scroll the document`)

 await clickMoveNavigation(page, 'First')
 await waitForPly(page, 0)
 const first = await moveVisibility(page, 1)
 assert.ok(first.inside, `${viewportName}: First returns the first move to the Moves viewport`)
 assert.ok(first.scrollTop <= 1, `${viewportName}: First returns the Moves container to the top`)
 assert.equal(first.pageScrollY, initialPageScroll, `${viewportName}: First does not scroll the document`)

 if (exerciseSteps) {
  for (let target = 1; target <= 80; target += 1) {
   await clickMoveNavigation(page, 'Next')
   await waitForPly(page, target)
  }
  const downward = await moveVisibility(page, 80)
  assert.ok(downward.inside && downward.scrollTop > 0, `${viewportName}: repeated Next follows downward`)

  const downwardScrollTop = downward.scrollTop
  for (let target = 79; target >= 5; target -= 1) {
   await clickMoveNavigation(page, 'Prev')
   await waitForPly(page, target)
  }
  const upward = await moveVisibility(page, 5)
  assert.ok(upward.inside && upward.scrollTop < downwardScrollTop, `${viewportName}: repeated Prev follows upward`)

  await page.locator('[data-analyze-ply="90"]').evaluate((element) => element.click())
  await waitForPly(page, 90)
  const direct = await moveVisibility(page, 90)
  assert.ok(direct.inside, `${viewportName}: direct offscreen move click follows the selected move`)

  await page.locator('.analyze-moves-list').evaluate((list) => { list.scrollTop = 0 })
  await page.waitForTimeout(50)
  assert.equal(await page.locator('.analyze-moves-list').evaluate((list) => list.scrollTop), 0, `${viewportName}: manual scrolling is not continuously overridden`)
  await clickMoveNavigation(page, 'Prev')
  await waitForPly(page, 89)
  assert.ok((await moveVisibility(page, 89)).inside, `${viewportName}: next explicit navigation resumes auto-follow`)
  assert.equal(await page.evaluate(() => window.scrollY), initialPageScroll, `${viewportName}: move following never scrolls the document`)
 }
}

async function measure(page) {
 return page.evaluate(() => {
  const rect = (element) => {
   const box = element?.getBoundingClientRect()
   if (!box) return null
   const style = getComputedStyle(element)
   return {
    x: box.x, y: box.y, width: box.width, height: box.height,
    right: box.right, bottom: box.bottom,
    gap: style.gap, padding: style.padding, overflow: style.overflow,
    display: style.display, columns: style.gridTemplateColumns,
   }
  }
  const titledCard = (title) => {
   const heading = [...document.querySelectorAll('.analyze-review-grid *')]
    .find((element) => element.children.length === 0 && element.textContent?.trim() === title)
   return heading?.parentElement ?? null
  }
  const titles = ['Game Analysis', 'Review Details', 'Status', 'Setup Position', 'Position / PGN', 'Opening', 'Moves', 'Move navigation', 'Import', 'Engine']
  const side = document.querySelector('.trainer-shell-side')
  return {
   panelVisibleRight: side.getBoundingClientRect().left + side.clientLeft + side.clientWidth,
   title: rect(document.querySelector('.trainer-shell-title')),
   board: rect(document.querySelector('.trainer-shell-board-frame')),
   side: rect(document.querySelector('.trainer-shell-side')),
   grid: rect(document.querySelector('.analyze-review-grid')),
   cards: Object.fromEntries(titles.map((title) => [title, rect(titledCard(title))])),
   inspired: [...document.querySelectorAll('.analyze-classification-label')]
    .find((element) => element.textContent?.includes('Inspired'))?.textContent?.trim(),
   scrollWidth: document.documentElement.scrollWidth,
   scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
   viewportWidth: window.innerWidth,
   viewportHeight: window.innerHeight,
  }
 })
}

let browser
let wideMetrics
try {
 await waitForServer()
 browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() })

 for (const viewport of [
  { width: 1920, height: 1080, name: 'wide desktop' },
  { width: 1366, height: 768, name: 'desktop' },
  { width: 1024, height: 768, name: 'tablet' },
  { width: 390, height: 844, name: 'mobile' },
 ]) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${baseUrl}/analyze/board?fen=${encodeURIComponent(fen)}`, { waitUntil: 'networkidle' })
  await page.getByRole('status').filter({ hasText: 'FEN loaded.' }).waitFor({ state: 'visible' })
  const layout = await measure(page)
  assert.equal(layout.scrollWidth <= viewport.width + 1, true, `${viewport.name}: no horizontal overflow`)
  assert.ok(layout.title && layout.title.x >= 0, `${viewport.name}: title remains on-screen`)
  assert.ok(layout.board && layout.board.x >= 0 && layout.board.right <= viewport.width + 1, `${viewport.name}: board remains on-screen`)
  assert.ok(layout.side && layout.side.x >= 0 && layout.side.right <= viewport.width + 1, `${viewport.name}: workspace remains on-screen`)
  assert.equal(layout.inspired, '★ Inspired', `${viewport.name}: Inspired glyph renders correctly`)
  for (const [title, card] of Object.entries(layout.cards)) {
   assert.ok(card && card.x >= 0 && card.right <= viewport.width + 1, `${viewport.name}: ${title} remains inside the page`)
   // Production's laptop minimum tracks extend 6.7px into panel padding.
   // Verify the actual clipping edge, not the grid content box; no tolerance added.
   assert.ok(card.x >= layout.grid.x - 1 && card.right <= layout.panelVisibleRight + 1, `${viewport.name}: ${title} remains inside the visible analysis panel`)
   assert.ok(card.y >= layout.grid.y - 1 && card.bottom <= layout.grid.bottom + 1, `${viewport.name}: ${title} is not vertically clipped by the grid`)
  }
  const cards = Object.entries(layout.cards)
  for (let i = 0; i < cards.length; i += 1) {
   for (let j = i + 1; j < cards.length; j += 1) {
    assert.equal(overlaps(cards[i][1], cards[j][1]), false, `${viewport.name}: ${cards[i][0]} must not overlap ${cards[j][0]}`)
   }
  }
  if (viewport.width === 1920) {
   wideMetrics = {
    viewportHeight: layout.viewportHeight,
    documentScrollHeight: layout.scrollHeight,
    hasVerticalScrollbar: layout.scrollHeight > layout.viewportHeight + 2,
    board: layout.board,
    engine: layout.cards.Engine,
   }
   console.log(`WIDE_METRICS ${JSON.stringify(wideMetrics)}`)
   assert.ok(layout.cards['Game Analysis'].width >= 260, 'wide desktop: classification card has a readable width')
   assert.ok(layout.cards['Review Details'].width >= 240, 'wide desktop: Review Details has a readable width')
   assert.ok(layout.cards.Moves.width >= 360, 'wide desktop: Moves has a readable width')
   // Paired production/candidate audit (2026-09-08): both have a 52px inset.
   // Keep the verified production baseline plus only 3px rendering tolerance.
   assert.ok(layout.grid.right >= viewport.width - 55, 'wide desktop: workspace inset stays within verified production 52px + 3px tolerance')
   assert.ok(parseFloat(layout.grid.gap) >= 10, 'wide desktop: cards retain a deliberate gap')
   assert.equal(layout.grid.overflow, 'visible', 'wide desktop: tall cards are not clipped')
   assert.ok(Math.abs(layout.cards.Opening.x - layout.cards.Moves.x) <= 2, 'wide desktop: Opening uses the Moves column')
   assert.ok(Math.abs(layout.cards.Engine.x - layout.cards.Moves.x) <= 2, 'wide desktop: Engine uses the Moves column')
   assert.ok(layout.cards.Opening.y >= layout.cards['Move navigation'].bottom + 10, 'wide desktop: Opening sits below Moves/navigation')
   assert.ok(layout.cards.Engine.y >= layout.cards.Opening.bottom + 10, 'wide desktop: Engine sits below Opening')
   assert.ok(layout.cards.Engine.bottom <= viewport.height + 2, 'wide desktop: Engine and its controls remain visible')
   assert.ok(layout.scrollHeight <= viewport.height + 2, 'wide desktop: Analyze fits without document scrolling')
   assert.ok(layout.board.width >= 730 && layout.board.width <= 742, 'wide desktop: approved 720px board remains effectively unchanged')
  }
  await page.close()
 }

 const functional = await browser.newPage({ viewport: { width: 1366, height: 768 } })
 await functional.goto(`${baseUrl}/analyze/board?fen=${encodeURIComponent(fen)}`, { waitUntil: 'networkidle' })
 await functional.getByRole('button', { name: 'Flip Board', exact: true }).click()
 await functional.getByRole('button', { name: 'View Black', exact: true }).click()
 await functional.getByRole('button', { name: 'View White', exact: true }).click()
 await functional.getByRole('button', { name: 'Setup Position', exact: true }).click()
 await functional.getByRole('button', { name: 'Close', exact: true }).click()
 for (const name of ['Analyze Now', 'Play Best Move', 'Upload PGN', 'Image to Position']) {
  assert.ok(await functional.getByRole('button', { name, exact: true }).count(), `${name} remains rendered`)
 }
 const pgn = '[Event "Layout regression"]\n[White "White Player"]\n[Black "Black Player"]\n\n1. e4 e5 2. Nf3 Nc6 *'
 await functional.getByPlaceholder('Paste FEN or PGN here').fill(pgn)
 await functional.getByRole('button', { name: 'Load', exact: true }).click()
 await functional.getByRole('status').filter({ hasText: 'PGN loaded:' }).waitFor({ state: 'visible' })
 await functional.getByText('Move navigation', { exact: true }).locator('..').getByRole('button', { name: 'Next', exact: true }).click()
 await functional.getByText('Ply 1 / 4', { exact: true }).waitFor({ state: 'visible' })
 await functional.close()

 for (const viewport of [
  { width: 1920, height: 1080, name: 'wide desktop', exerciseSteps: true },
  { width: 1366, height: 768, name: 'desktop', exerciseSteps: false },
  { width: 390, height: 844, name: 'mobile', exerciseSteps: false },
 ]) {
  const page = await browser.newPage({ viewport })
  await verifyMoveFollow(page, viewport.name, viewport.exerciseSteps)
  const horizontalGeometry = await page.evaluate(() => ({
   viewportWidth: window.innerWidth,
   documentWidth: document.documentElement.scrollWidth,
   offenders: [...document.querySelectorAll('body *')]
    .map((element) => ({
     tag: element.tagName,
     className: typeof element.className === 'string' ? element.className : '',
     text: element.textContent?.trim().slice(0, 40) ?? '',
     right: Math.round(element.getBoundingClientRect().right),
     width: Math.round(element.getBoundingClientRect().width),
    }))
    .filter((entry) => entry.right > window.innerWidth + 1)
    .sort((a, b) => b.right - a.right)
    .slice(0, 8),
  }))
  assert.ok(horizontalGeometry.documentWidth <= horizontalGeometry.viewportWidth + 1, `${viewport.name}: long game introduces no horizontal overflow (${JSON.stringify(horizontalGeometry)})`)
  await page.close()
 }

 console.log('PASS: Analyze production bundle has stable desktop/mobile geometry, active-move following, clean classification glyphs, and intact controls')
} finally {
 if (browser) await browser.close().catch(() => {})
 if (vite.exitCode == null) {
  vite.kill()
  await Promise.race([once(vite, 'exit'), new Promise((done) => setTimeout(done, 2_000))]).catch(() => {})
 }
}
