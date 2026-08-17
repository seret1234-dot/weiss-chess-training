import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = process.env.TRAINER_LAYOUT_BASE_URL ?? 'http://127.0.0.1:5173'
const viewports = [
 { width: 1366, height: 768 },
 { width: 1440, height: 900 },
 { width: 1650, height: 900 },
 { width: 1920, height: 1080 },
 { width: 768, height: 1024 },
]

const fixtureOpening = {
 id: 'layout-regression-fixture',
 slug: 'layout-regression-fixture',
 name: 'Layout Regression Fixture',
 family: 'Regression Test',
 variation: 'Starter line',
 subvariation: null,
 eco: 'A00',
 uci_moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
 san_moves: ['e4', 'e5', 'Nf3', 'Nc6'],
 ply_count: 4,
 final_epd: null,
}

function intersects(a, b) {
 return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

async function rect(page, selector) {
 const value = await page.locator(selector).first().evaluate((element) => {
  const box = element.getBoundingClientRect()
  return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }
 })
 assert(value.width > 0 && value.height > 0, `${selector} should have a visible bounding rectangle`)
 return value
}

async function assertBoardSafety(page, { boardSelector, completionHostSelector, label, viewport }) {
 const board = await rect(page, boardSelector)
 assert(Math.abs(board.width - board.height) <= 2, `${label} board must remain square at ${viewport.width}x${viewport.height}`)
 assert(board.top >= -1, `${label} board must not start above the viewport at ${viewport.width}x${viewport.height}`)
 assert(board.bottom <= viewport.height + 1, `${label} board must fit vertically at ${viewport.width}x${viewport.height}`)

 const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
 assert(overflow <= 1, `${label} must not cause horizontal page overflow at ${viewport.width}x${viewport.height}`)

 const squares = await page.locator(`${boardSelector} [data-square]`).count()
 assert(squares >= 64, `${label} must render all 64 squares at ${viewport.width}x${viewport.height}`)

 const blockers = await page.locator('.global-floating-play-desktop, .background-analysis-status').evaluateAll((elements) =>
  elements
   .filter((element) => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden')
   .map((element) => {
    const box = element.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }
   })
 )
 for (const blocker of blockers) {
  assert(!intersects(board, blocker), `${label} floating UI must not cover the board at ${viewport.width}x${viewport.height}`)
 }

  await page.locator(completionHostSelector).evaluate((host) => {
  const button = document.createElement('button')
  button.className = 'auto-training-controller'
  button.dataset.testid = 'finish-drill-continue'
  button.textContent = 'Finish drill & continue'
  host.append(button)
  })
 const boardWithCompletionControl = await rect(page, boardSelector)
 const cta = await rect(page, '[data-testid="finish-drill-continue"]')
 assert(boardWithCompletionControl.bottom <= viewport.height + 1, `${label} board must remain visible after Finish drill & continue appears at ${viewport.width}x${viewport.height}`)
 assert(!intersects(boardWithCompletionControl, cta), `${label} Finish drill & continue must not intersect the chessboard at ${viewport.width}x${viewport.height}`)
}

const controllerSource = await readFile(new URL('../src/components/AutoTrainingController.tsx', import.meta.url), 'utf8')
assert.match(controllerSource, /createPortal/)
assert.match(controllerSource, /trainer-completion-actions/)

const browser = await chromium.launch({ headless: true })
try {
 for (const viewport of viewports) {
  const page = await browser.newPage({ viewport })
  await page.route('**/rest/v1/opening_lines*', async (route) => {
   await route.fulfill({ contentType: 'application/json', body: JSON.stringify([fixtureOpening]) })
  })

  await page.goto(`${baseUrl}/board-vision`, { waitUntil: 'networkidle' })
  await page.locator('#board-vision-board').waitFor()
  await assertBoardSafety(page, {
   boardSelector: '#board-vision-board',
   completionHostSelector: '.board-vision-completion-actions',
   label: 'Board Vision',
   viewport,
  })

  await page.goto(`${baseUrl}/openings/layout-regression-fixture`, { waitUntil: 'networkidle' })
  await page.locator('#opening-trainer-board').waitFor()
  await assertBoardSafety(page, {
   boardSelector: '#opening-trainer-board',
   completionHostSelector: '.opening-trainer-completion-actions',
   label: 'Opening Trainer',
   viewport,
  })

  await page.close()
 }
} finally {
 await browser.close()
}

console.log(`Responsive trainer layout regression checks passed for ${viewports.map(({ width, height }) => `${width}x${height}`).join(', ')}.`)
