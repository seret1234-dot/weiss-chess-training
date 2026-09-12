import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4217
const baseUrl = `http://${host}:${port}`
const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', host, '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let output = ''
vite.stdout.on('data', (chunk) => { output += chunk })
vite.stderr.on('data', (chunk) => { output += chunk })

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try { const response = await fetch(baseUrl); if (response.ok) return } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Preview server did not start:\n${output}`)
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    for (const route of ['/privacy', '/privacy/he', '/accessibility', '/accessibility/he']) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
      await page.locator('#site-main-content').waitFor({ state: 'attached', timeout: 20_000 })
      assert.equal(await page.locator('[role="main"]').count(), 1, `${route} has one main landmark at ${viewport.width}px`)
      assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1, `${route} has one h1`)
      assert.equal(await page.getByRole('contentinfo').count(), 1, `${route} has a footer`)
      assert.equal(await page.getByRole('link', { name: 'Privacy Policy' }).count() > 0, true)
      assert.equal(await page.getByRole('link', { name: 'Accessibility' }).count() > 0, true)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      assert.equal(overflow, false, `${route} has no viewport horizontal overflow at ${viewport.width}px`)
    }
    await page.goto(`${baseUrl}/accessibility/he`, { waitUntil: 'domcontentloaded' })
    assert.deepEqual(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]), ['he', 'rtl'])
    await page.goto(`${baseUrl}/privacy`, { waitUntil: 'domcontentloaded' })
    await page.locator('.skip-to-content').waitFor({ state: 'attached', timeout: 20_000 })
    const contrast = await page.evaluate(() => {
      const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
      const luminance = (value) => {
        const channels = rgb(value).map((channel) => {
          const normalized = channel / 255
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
        })
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
      }
      const lead = document.querySelector('.legal-page__lead')
      const card = document.querySelector('.legal-page__card')
      const foreground = getComputedStyle(lead).color
      const background = getComputedStyle(card).backgroundColor
      const lighter = Math.max(luminance(foreground), luminance(background))
      const darker = Math.min(luminance(foreground), luminance(background))
      return (lighter + 0.05) / (darker + 0.05)
    })
    assert.ok(contrast >= 4.5, `legal lead text has AA contrast at ${viewport.width}px`)
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), href: document.activeElement?.getAttribute('href') }))
    assert.deepEqual(focused, { text: 'Skip to main content', href: '#site-main-content' })
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'site-main-content')
    await page.close()
  }

  const boardPage = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await boardPage.goto(`${baseUrl}/sample-training`, { waitUntil: 'domcontentloaded' })
  const boardGroup = boardPage.locator('[role="group"][aria-label$="chessboard"]').first()
  await boardGroup.waitFor({ state: 'attached', timeout: 20_000 })
  const descriptionId = await boardGroup.getAttribute('aria-describedby')
  assert.ok(descriptionId, 'shared chessboard has an accessible description reference')
  const description = await boardPage.locator(`[id=${JSON.stringify(descriptionId)}]`).textContent()
  assert.match(description || '', /Board orientation: (White|Black) at bottom\./)
  assert.match(description || '', /(White|Black) to move\./)
  assert.match(description || '', /Visual coordinates are (shown|hidden); square names remain available/)
  assert.equal(await boardGroup.getAttribute('aria-live'), null, 'board description is not a noisy live region')

  const setupPage = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await setupPage.goto(`${baseUrl}/analyze/setup`, { waitUntil: 'domcontentloaded' })
  const setupGrid = setupPage.getByRole('grid', { name: 'Setup Position chessboard' })
  await setupGrid.waitFor({ state: 'visible', timeout: 20_000 })
  assert.equal(await setupGrid.getAttribute('tabindex'), '0', 'setup board has one keyboard entry point')
  assert.equal(await setupPage.getByRole('gridcell').count(), 64, 'setup squares are named grid cells')
  assert.equal(await setupPage.locator('[role="gridcell"][tabindex]').count(), 0, 'setup squares do not create 64 Tab stops')
  await setupGrid.focus()
  const activeBefore = await setupGrid.getAttribute('aria-activedescendant')
  await setupPage.keyboard.press('ArrowUp')
  const activeAfter = await setupGrid.getAttribute('aria-activedescendant')
  assert.notEqual(activeAfter, activeBefore, 'Arrow keys move the setup grid active square')
  assert.match(await setupPage.locator(`#${activeAfter}`).getAttribute('aria-label') || '', /^[a-h][1-8], (?:White|Black|empty square)/)
  await setupPage.close()

  const imageEditorPage = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await imageEditorPage.goto(`${baseUrl}/analyze/board`, { waitUntil: 'domcontentloaded' })
  const imageEditorButton = imageEditorPage.getByRole('button', { name: 'Image to Position', exact: true })
  await imageEditorButton.waitFor({ state: 'visible', timeout: 20_000 })
  await imageEditorButton.click()
  const imageDialog = imageEditorPage.getByRole('dialog', { name: 'Image to Position' })
  await imageDialog.waitFor({ state: 'visible' })
  const imageGrid = imageDialog.getByRole('grid', { name: 'Image to Position editor chessboard' })
  assert.equal(await imageGrid.getByRole('gridcell').count(), 64)
  assert.equal(await imageGrid.locator('[role="gridcell"][tabindex="0"]').count(), 1, 'image editor has one square in the Tab order')
  const activeImageSquare = imageGrid.locator('[role="gridcell"][tabindex="0"]')
  await activeImageSquare.focus()
  const imageSquareBefore = await activeImageSquare.getAttribute('id')
  await imageEditorPage.keyboard.press('ArrowUp')
  const imageSquareAfter = await imageEditorPage.evaluate(() => document.activeElement?.id)
  assert.notEqual(imageSquareAfter, imageSquareBefore, 'image editor Arrow keys move square focus')
  await imageDialog.getByRole('button', { name: 'Close' }).click()
  assert.equal(await imageDialog.count(), 0)
  await imageEditorPage.close()

  for (const route of ['/tactics/m1/knight-fork', '/mates/m1/smothered']) {
    const puzzlePage = await browser.newPage({ viewport: { width: 1366, height: 768 } })
    await puzzlePage.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
    const puzzleBoard = puzzlePage.locator('[role="group"][aria-label$="chessboard"]').first()
    await puzzleBoard.waitFor({ state: 'attached', timeout: 30_000 })
    const puzzleDescriptionId = await puzzleBoard.getAttribute('aria-describedby')
    const puzzleDescription = await puzzlePage.locator(`[id=${JSON.stringify(puzzleDescriptionId)}]`).textContent()
    assert.match(puzzleDescription || '', /Board orientation: (?:White|Black) at bottom\./)
    assert.match(puzzleDescription || '', /(?:White|Black) to move\./)
    assert.doesNotMatch(puzzleDescription || '', /expected (?:source|destination|move)|correct move|solution line|mate line/i, `${route} does not leak solution semantics`)
    assert.equal(await puzzlePage.getByText('Keyboard move controls', { exact: true }).count(), 1, `${route} exposes the existing accessible move path`)
    await puzzlePage.close()
  }

  const menuButton = boardPage.getByRole('button', { name: 'Menu' })
  await menuButton.focus()
  // Keyboard focus intentionally opens the desktop menu; pressing Enter here
  // would exercise the separate click-to-toggle behavior and close it again.
  assert.equal(await menuButton.getAttribute('aria-expanded'), 'true')
  const coordinatesButton = boardPage.getByRole('button', { name: /Coordinates (?:on|off)\. Toggle board coordinates/ }).first()
  await coordinatesButton.focus()
  const coordinatesBefore = await coordinatesButton.getAttribute('aria-pressed')
  await boardPage.keyboard.press('Space')
  assert.notEqual(await coordinatesButton.getAttribute('aria-pressed'), coordinatesBefore, 'coordinates state changes through the keyboard')
  await boardPage.keyboard.press('Escape')
  assert.equal(await menuButton.getAttribute('aria-expanded'), 'false')
  await boardPage.close()

  const semanticRoutes = [
    '/',
    '/tactics',
    '/mates',
    '/master-tactics',
    '/master-mates',
    '/openings',
    '/openings/my-openings',
    '/master-games',
    '/analyze/board',
    '/account',
    '/privacy',
    '/privacy/he',
    '/accessibility',
    '/accessibility/he',
  ]
  const keyboardPage = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  for (const route of semanticRoutes) {
    await keyboardPage.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
    await keyboardPage.locator('#site-main-content').waitFor({ state: 'attached', timeout: 20_000 })
    assert.equal(await keyboardPage.locator('[role="main"]').count(), 1, `${route} exposes one main landmark`)
    assert.ok(await keyboardPage.getByRole('heading').count(), `${route} exposes a useful heading`)
    for (let press = 0; press < 4; press += 1) await keyboardPage.keyboard.press('Tab')
    const focusState = await keyboardPage.evaluate(() => ({
      tag: document.activeElement?.tagName,
      hidden: document.activeElement?.closest('[aria-hidden="true"]') !== null,
    }))
    assert.notEqual(focusState.tag, 'BODY', `${route} has keyboard-reachable controls`)
    assert.equal(focusState.hidden, false, `${route} does not focus an aria-hidden control`)
    await keyboardPage.keyboard.press('Shift+Tab')
    await keyboardPage.keyboard.press('Escape')
  }
  await keyboardPage.close()

  const auth = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await auth.goto(`${baseUrl}/auth?mode=signup`, { waitUntil: 'domcontentloaded' })
  await auth.getByLabel('Email').waitFor({ state: 'visible', timeout: 20_000 })
  assert.equal(await auth.getByLabel('Email').count(), 1)
  assert.equal(await auth.getByLabel('Password').count(), 1)
  assert.equal(await auth.getByRole('complementary', { name: 'Privacy notice' }).count(), 1)
  await auth.close()
  const reflow = await browser.newPage({ viewport: { width: 320, height: 844 } })
  await reflow.goto(`${baseUrl}/privacy`, { waitUntil: 'domcontentloaded' })
  await reflow.locator('#site-main-content').waitFor({ state: 'attached', timeout: 20_000 })
  for (const size of ['200%', '400%']) {
    await reflow.evaluate((value) => { document.documentElement.style.fontSize = value }, size)
    assert.equal(await reflow.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, `privacy page reflows at ${size} text size`)
  }
  await reflow.close()
  console.log('Rendered compliance checks passed across required routes at 1920, 1366, 390, and 320 widths, including keyboard traversal, contrast, and 200%/400% legal-page reflow.')
} finally {
  await browser?.close()
  vite.kill()
}
