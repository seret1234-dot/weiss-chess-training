import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const host = '127.0.0.1'
const vitePort = 4187
const proxyPort = 4188
const viteUrl = `http://${host}:${vitePort}`
const baseUrl = `http://${host}:${proxyPort}`
const chromePath = chromium.executablePath()

await access(chromePath)

const vite = spawn(process.execPath, [
  resolve(root, 'node_modules/vite/bin/vite.js'),
  'preview',
  '--host', host,
  '--port', String(vitePort),
  '--strictPort',
], {
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
    try {
      const response = await fetch(viteUrl)
      if (response.ok) return
    } catch {
      // The Vite listener has not bound its port yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Vite did not become ready:\n${viteOutput}`)
}

async function expectPath(page, pathname) {
  await page.waitForURL((url) => url.pathname === pathname)
  assert.equal(new URL(page.url()).pathname, pathname)
}

async function expectParentState(page, parentPath) {
  const state = await page.evaluate(() => ({
    pathname: window.location.pathname,
    state: window.history.state,
    parentPath: window.history.state?.usr?.weissHierarchyParentPath,
  }))
  assert.equal(state.parentPath, parentPath, `${state.pathname} must retain its actual router parent state`)
}

async function clickButtonStartingWith(page, label) {
  const button = page.locator('button').filter({ hasText: label }).first()
  await button.click()
}

async function clickPageBack(page) {
  const pageBack = page.locator('button').filter({ hasText: '\u2190 Back' })
  await pageBack.first().waitFor({ state: 'visible', timeout: 60_000 })
  assert.equal(await pageBack.count(), 1, 'Exactly one page-level Back control must be rendered')
  await pageBack.click()
}

async function expectOnlyPageBack(page) {
  const pageBack = page.locator('button').filter({ hasText: '\u2190 Back' })
  await pageBack.first().waitFor({ state: 'visible', timeout: 60_000 })
  assert.equal(await pageBack.count(), 1, 'Page-level Back must be present exactly once')
  assert.equal(await page.getByRole('button', { name: 'Go back' }).count(), 0, 'GlobalBackButton must be suppressed on this hierarchy')
}

async function expectPatternTrainerReady(page) {
  await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 60_000 })
  await page.locator('.trainer-shell-title').waitFor({ state: 'visible', timeout: 60_000 })
  assert.equal(
    await page.getByText('Loading puzzles...', { exact: true }).count(),
    0,
    'PatternMateTrainer must finish loading before navigation assertions',
  )
}

let browser
let page
let context
let proxy
const browserErrors = []
const routeTrace = []
const dataRequestTrace = []
const pendingDataRequests = new Set()
function isDataRequest(url) {
  return url.includes('/data/') || url.includes('supabase.co')
}
async function captureRoute(page, action) {
  routeTrace.push(await page.evaluate((traceAction) => ({
    action: traceAction,
    pathname: window.location.pathname,
    state: window.history.state,
  }), action))
}
try {
  await waitForServer()
  proxy = createServer((clientRequest, clientResponse) => {
    const upstreamRequest = request({
      hostname: host,
      port: vitePort,
      path: clientRequest.url,
      method: clientRequest.method,
      headers: clientRequest.headers,
    }, (upstreamResponse) => {
      const headers = { ...upstreamResponse.headers }
      delete headers['cross-origin-opener-policy']
      delete headers['cross-origin-embedder-policy']
      clientResponse.writeHead(upstreamResponse.statusCode ?? 502, headers)
      upstreamResponse.pipe(clientResponse)
    })
    upstreamRequest.on('error', (error) => clientResponse.destroy(error))
    clientRequest.pipe(upstreamRequest)
  })
  await new Promise((resolveProxy, rejectProxy) => {
    proxy.once('error', rejectProxy)
    proxy.listen(proxyPort, host, resolveProxy)
  })
  browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
  })
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  })
  page = await context.newPage()
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`))
  page.on('request', (requestInfo) => {
    if (!isDataRequest(requestInfo.url())) return
    pendingDataRequests.add(requestInfo.url())
    dataRequestTrace.push(`request: ${requestInfo.method()} ${requestInfo.url()}`)
  })
  page.on('requestfinished', (requestInfo) => {
    if (!isDataRequest(requestInfo.url())) return
    pendingDataRequests.delete(requestInfo.url())
    dataRequestTrace.push(`finished: ${requestInfo.url()}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`)
  })
  page.on('requestfailed', (requestInfo) => {
    pendingDataRequests.delete(requestInfo.url())
    browserErrors.push(`requestfailed: ${requestInfo.url()} ${requestInfo.failure()?.errorText ?? ''}`)
  })
  page.on('response', (response) => {
    if (isDataRequest(response.url())) {
      dataRequestTrace.push(`response: ${response.status()} ${response.url()}`)
    }
    if (response.url().includes('/src/') && !response.ok()) {
      browserErrors.push(`module response: ${response.status()} ${response.url()}`)
    }
  })
  page.setDefaultTimeout(60_000)

  await page.goto(baseUrl, { waitUntil: 'commit', timeout: 60_000 })
  await captureRoute(page, 'initial Home')
  await clickButtonStartingWith(page, 'Mates')
  await expectPath(page, '/mates')
  await captureRoute(page, 'click Home Mates')
  await expectParentState(page, '/')
  await expectOnlyPageBack(page)

  await clickButtonStartingWith(page, 'Mate in 1')
  await expectPath(page, '/mates/m1')
  await captureRoute(page, 'click Mate in 1')
  await expectParentState(page, '/mates')
  await expectOnlyPageBack(page)

  await clickButtonStartingWith(page, 'Kill Box')
  await expectPath(page, '/mates/m1/kill-box')
  await captureRoute(page, 'click Kill Box')
  await expectParentState(page, '/mates/m1')
  await expectOnlyPageBack(page)

  const adjacentRook = page.getByRole('button', { name: /Adjacent Rook/ }).first()
  await adjacentRook.click()
  await expectPath(page, '/mates/m1/kill-box-adjacent-rook')
  await expectPatternTrainerReady(page)
  await captureRoute(page, 'click Adjacent Rook')
  await expectParentState(page, '/mates/m1/kill-box')
  await expectOnlyPageBack(page)

  const normalBackPaths = [
    '/mates/m1/kill-box',
    '/mates/m1',
    '/mates',
    '/',
  ]
  for (const pathname of normalBackPaths) {
    await clickPageBack(page)
    await expectPath(page, pathname)
    await captureRoute(page, `site Back to ${pathname}`)
  }
  assert.equal(await page.locator('button').filter({ hasText: '\u2190 Back' }).count(), 0, 'Home must not render a page Back control')
  assert.equal(await page.getByRole('button', { name: 'Go back' }).count(), 0, 'Home must not render GlobalBackButton')

  for (const subtype of ['adjacent-rook', 'rook-rail', 'queen-fence']) {
    await page.goto(`${baseUrl}/mates/m1/kill-box`, { waitUntil: 'commit', timeout: 60_000 })
    await page.getByRole('button', {
      name: new RegExp(subtype === 'adjacent-rook' ? 'Adjacent Rook' : subtype === 'rook-rail' ? 'Rook Rail' : 'Queen Fence'),
    }).first().click()
    await expectPath(page, `/mates/m1/kill-box-${subtype}`)
    await expectPatternTrainerReady(page)
    await clickPageBack(page)
    await expectPath(page, '/mates/m1/kill-box')
  }

  for (const distance of [1, 2, 3, 4, 5]) {
    const level = `/mates/m${distance}`
    await page.goto(`${baseUrl}${level}/kill-box`, { waitUntil: 'commit', timeout: 60_000 })
    await clickPageBack(page)
    await expectPath(page, level)

    await page.goto(`${baseUrl}${level}/kill-box-adjacent-rook`, { waitUntil: 'commit', timeout: 60_000 })
    await expectPatternTrainerReady(page)
    await clickPageBack(page)
    await expectPath(page, `${level}/kill-box`)
  }

  await page.goto(`${baseUrl}/mates/m1`, { waitUntil: 'commit', timeout: 60_000 })
  await clickButtonStartingWith(page, 'Smothered')
  await expectPath(page, '/mates/m1/smothered')
  await expectPatternTrainerReady(page)
  const normalMateGlobalBack = page.locator('button[aria-label="Go back"]')
  await normalMateGlobalBack.waitFor({ state: 'visible', timeout: 60_000 })
  assert.equal(await normalMateGlobalBack.count(), 1, 'Normal Mate trainer must retain GlobalBackButton')
  await normalMateGlobalBack.click()
  await expectPath(page, '/mates/m1')

  await page.goto(`${baseUrl}/tactics/m1/fork`, { waitUntil: 'commit', timeout: 60_000 })
  const normalTacticsGlobalBack = page.locator('button[aria-label="Go back"]')
  await normalTacticsGlobalBack.waitFor({ state: 'visible', timeout: 60_000 })
  assert.equal(await normalTacticsGlobalBack.count(), 1, 'Normal Tactics trainer must retain GlobalBackButton')

  console.log(JSON.stringify({
    passed: true,
    normalForwardActions: ['PUSH', 'PUSH', 'PUSH', 'PUSH'],
    normalBackActions: ['POP', 'POP', 'POP', 'POP'],
    actualNormalBackPaths: normalBackPaths,
    directLinksVerified: 10,
    subtypesVerified: 3,
    ordinaryMateVerified: 'smothered',
    ordinaryTacticsTrainerVerified: 'fork',
  }))
} catch (error) {
  const body = page ? (await page.locator('body').textContent().catch(() => '') ?? '') : ''
  const rootHtml = page ? (await page.locator('#root').innerHTML().catch(() => '') ?? '') : ''
  const domState = page ? await page.evaluate(() => ({
    url: window.location.href,
    pathname: window.location.pathname,
    patternMateTrainerMounted: document.body.textContent?.includes('Loading puzzles...') || Boolean(document.querySelector('.trainer-shell-page')),
    trainerShellMounted: Boolean(document.querySelector('.trainer-shell-page')),
    pageBackCount: [...document.querySelectorAll('button')].filter((button) => button.textContent?.includes('← Back')).length,
  })).catch(() => null) : null
  throw new Error(`${error.message}\nRoute trace:\n${JSON.stringify(routeTrace, null, 2)}\nDOM state:\n${JSON.stringify(domState, null, 2)}\nData requests:\n${dataRequestTrace.join('\n') || '(none)'}\nPending data requests:\n${[...pendingDataRequests].join('\n') || '(none)'}\nBrowser errors:\n${browserErrors.join('\n') || '(none)'}\nBody text:\n${body.slice(0, 1_000)}\nRoot HTML:\n${rootHtml.slice(0, 1_000)}`)
} finally {
  await context?.close()
  await browser?.close()
  await new Promise((resolveProxy) => proxy?.close(resolveProxy) ?? resolveProxy())
  if (!vite.killed) {
    vite.kill()
    await once(vite, 'exit')
  }
}
