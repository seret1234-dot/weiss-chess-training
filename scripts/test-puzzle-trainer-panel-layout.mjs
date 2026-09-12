import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { chromium } from 'playwright'
import { installAiVoiceMock } from './ai-voice-rendered-support.mjs'

// Serve the actual production bundle. No engine, auth writes, or corpus changes.
const root = process.cwd()
const dist = resolve(root, 'dist')
const corpus = resolve(root, 'public/data/master-puzzles/v1')
const port = Number(process.env.TRAINER_PANEL_TEST_PORT ?? 4211)
const base = `http://127.0.0.1:${port}`
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, base).pathname)
  const file = resolve(dist, pathname === '/' ? 'index.html' : `.${pathname}`)
  if (!file.startsWith(dist + sep)) { res.writeHead(403).end(); return }
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(await readFile(resolve(dist, 'index.html')))
  }
})
await new Promise(done => server.listen(port, '127.0.0.1', done))
if (process.argv.includes('--serve-only')) {
  console.log(`Production layout preview: ${base}`)
  await new Promise(() => {})
}

const routes = ['/mates/m1/back-rank', '/tactics/m1/bishop-fork', '/master-tactics/1/hanging-piece', '/master-tactics/2/bishop-fork', '/master-mates/1/smothered']
const viewports = [
  { width: 1920, height: 1080 },
  { width: 2048, height: 1030 },
  { width: 1650, height: 900 },
  { width: 1366, height: 768 },
  { width: 1366, height: 650 },
  { width: 390, height: 844 },
]
const errors = []
const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of viewports) {
    if (process.argv.includes('--mobile-only') && viewport.width > 768) continue
    for (const path of routes) {
      const context = await browser.newContext({ viewport })
      // Synthetic recognition only: exercise real Voice UI sizing without mic access.
      await context.addInitScript(() => {
        window.SpeechRecognition = class {
          start() { window.__layoutRecognition = this; this.onstart?.() }
          abort() { this.onend?.() }
        }
      })
      const page = await context.newPage()
      await installAiVoiceMock(page)
      page.on('pageerror', error => errors.push(`${path}: ${error.message}`))
      await page.route('**/*', async route => {
        const url = route.request().url()
        const marker = ['/storage/v1/object/public/master-puzzles/v1/v1/', '/data/master-puzzles/v1/'].find(m => url.includes(m))
        if (!marker) return route.fallback()
        const relative = decodeURIComponent(url.split(marker)[1].split('?')[0])
        const file = resolve(corpus, relative)
        assert.ok(file.startsWith(corpus + sep), 'fixture remains inside canonical corpus')
        await route.fulfill({ contentType: 'application/json', body: await readFile(file) })
      })
      try {
        await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
        const side = page.locator('.trainer-shell-side')
        await side.getByRole('button', { name: 'Hint', exact: true }).waitFor({ timeout: 30000 })
        await page.getByText(/^Find (?:the (?:mate|tactic)|move)/).waitFor({ timeout: 30000 })
        const measure = () => page.evaluate(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON()
          const panel = document.querySelector('.trainer-shell-side')
          return {
            side: rect('.trainer-shell-side'), board: rect('.trainer-shell-custom-board-slot .accessible-chessboard'),
            boardColumn: rect('.trainer-shell-board-column'), footer: rect('.compliance-footer'),
            overflowY: getComputedStyle(panel).overflowY,
            scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
            panelHorizontalOverflow: panel.scrollWidth - panel.clientWidth,
            controls: rect('.trainer-puzzle-panel-controls'), reference: rect('.trainer-puzzle-panel-reference'),
            horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
          }
        })
        // Reconstruct the pre-voice composition by removing only the Voice host
        // from layout, retaining the same board, keyboard controls and side panel.
        await page.evaluate(() => {
          document.querySelector('.trainer-shell-board-controls select').parentElement.style.display = 'none'
        })
        const preVoice = await measure()
        const actionSizes = () => page.locator('.trainer-shell-puzzle-actions button').evaluateAll(buttons => buttons.map(button => ({
          text: button.textContent.trim(), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
        })))
        const preVoiceActions = await actionSizes()
        await page.evaluate(() => {
          document.querySelector('.trainer-shell-board-controls select').parentElement.style.display = ''
        })
        async function assertVoiceGeometry(label) {
          const current = await measure()
          for (const key of ['board', 'boardColumn', 'side', 'controls', 'reference']) {
            assert.ok(Math.abs(current[key].width - preVoice[key].width) <= 1, `${path}/${label}: ${key} width must match pre-voice (${preVoice[key].width} vs ${current[key].width})`)
            assert.ok(Math.abs(current[key].left - preVoice[key].left) <= 1, `${path}/${label}: ${key} horizontal placement unchanged`)
          }
          assert.deepEqual(await actionSizes(), preVoiceActions, `${path}/${label}: Voice cannot squeeze or rewrap action buttons`)
          const voiceBounds = await page.locator('.trainer-shell-board-controls').evaluate(el => ({ overflow: el.scrollWidth - el.clientWidth, top: el.getBoundingClientRect().top }))
          assert.ok(voiceBounds.overflow <= 1, `${path}/${label}: no horizontal Voice overflow`)
          assert.ok(voiceBounds.top >= current.board.bottom, `${path}/${label}: Voice remains below board`)
          assert.ok(current.horizontalOverflow <= 1, `${path}/${label}: no horizontal page overflow`)
        }
        await assertVoiceGeometry('mouse')
        const experimental = await page.getByRole('option', { name: 'Experimental Browser Voice', exact: true }).count() > 0
        if (!experimental) assert.deepEqual(await page.getByLabel('Input', { exact: true }).locator('option').allTextContents(), ['Mouse', 'AI Voice', 'Mouse + AI Voice'])
        await page.getByLabel('Input', { exact: true }).selectOption(experimental ? 'both' : 'ai-both')
        await page.getByRole('status').filter({ hasText: 'Listening' }).waitFor()
        await assertVoiceGeometry('listening')
        if (experimental) await page.evaluate(() => {
          const recognition = window.__layoutRecognition
          recognition.onspeechstart?.()
          recognition.onresult?.({ resultIndex: 0, results: [Object.assign([
            { transcript: 'backgroundconversation'.repeat(28), confidence: 0.99 },
            { transcript: 'unmatched speech', confidence: 0.5 },
          ], { isFinal: true })] })
        })
        else await page.evaluate(async transcript => {
          // This layout harness uses the real clock, unlike the mastery fixture.
          // Feed actual frame cadence so PCM/VAD observes speech and end-silence.
          window.__aiTranscript = transcript
          const node = window.__aiCaptureNode
          for (let i = 0; i < 70; i++) {
            await new Promise(done => setTimeout(done, 10))
            node.port.onmessage?.({ data: new Float32Array(160).fill(i < 16 ? .1 : 0) })
          }
        }, 'backgroundconversation'.repeat(28))
        await page.getByRole('status').filter({ hasText: experimental ? 'No clear chess answer' : 'Could not understand' }).waitFor()
        await page.getByText('Voice timing', { exact: true }).click()
        await assertVoiceGeometry('long transcript and expanded timing')
        await page.getByLabel('Input', { exact: true }).selectOption('ai-both')
        await page.getByText('10 / 10 free uses remaining today', { exact: true }).waitFor()
        await page.getByRole('status').filter({ hasText: '🎙 Listening' }).waitFor()
        await assertVoiceGeometry('AI listening and free quota')
        await page.route('**/api/chess-voice-transcribe',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({allowed:false,code:'VOICE_QUOTA_EXCEEDED',quota:{tier:'free',limit:10,used:10,remaining:0}})}))
        await page.getByRole('button',{name:'Retry microphone',exact:true}).click()
        await page.getByRole('link',{name:'Upgrade',exact:true}).waitFor()
        await assertVoiceGeometry('AI quota exhausted and upgrade')
        await page.getByLabel('Input', { exact: true }).selectOption('mouse')
        await page.evaluate(() => window.scrollTo(0, 0))
        const initial = await measure()
        for (const button of await actionSizes()) {
          assert.ok(button.height <= 66, `${path}: ${button.text} must not wrap into a tall narrow button (${button.width}x${button.height})`)
        }
        console.log(`Voice layout parity ${viewport.width}x${viewport.height} ${path}: board/frame/panel=${Math.round(initial.board.width)}/${Math.round(initial.boardColumn.width)}/${Math.round(initial.side.width)}px; button heights=${(await actionSizes()).map(b => b.height).join(',')}`)
        assert.ok(initial.horizontalOverflow <= 1, `${path}: no horizontal page overflow`)
        assert.ok(initial.panelHorizontalOverflow <= 1, `${path}: no hidden horizontal panel overflow`)
        assert.equal(await side.locator('.trainer-puzzle-panel').count(), 1, `${path}: uses the shared panel composition`)
        assert.equal(await side.locator('.trainer-puzzle-panel-controls .site-explanation-box').count(), 0, `${path}: explanation is not stacked with controls`)
        assert.equal(await side.locator('.trainer-puzzle-panel-reference .site-explanation-box').count(), 1, `${path}: explanation in adjacent reference area`)
        if (viewport.width > 1240) {
          assert.ok(initial.reference.left >= initial.controls.right, `${path}: reference beside controls, including short laptops`)
          assert.ok(Math.abs(initial.reference.top - initial.controls.top) <= 1, `${path}: columns top-aligned`)
        } else {
          assert.ok(initial.reference.top >= initial.controls.bottom, `${path}: mobile stacks controls then reference`)
        }
        if (path.startsWith('/master-')) {
          assert.ok((await side.locator('.trainer-puzzle-panel-reference').innerText()).includes('Master game'), `${path}: provenance visible with explanation`)
          assert.ok(!(await side.locator('.trainer-puzzle-panel-controls').innerText()).includes('Master game'), `${path}: provenance cannot push controls down`)
          assert.equal(await page.locator('.trainer-shell-board-top').count(), 1, `${path}: top player label preserved`)
          assert.equal(await page.locator('.trainer-shell-board-bottom').count(), 1, `${path}: bottom player label preserved`)
        }
        if (viewport.width > 768) {
          assert.equal(initial.overflowY, 'auto', `${path}: desktop side panel scrolls instead of clipping`)
          assert.ok(initial.side.height <= viewport.height - 24, `${path}: viewport-bounded side panel`)
          assert.ok(initial.side.left >= initial.board.right, `${path}: desktop two-column layout preserved`)
          if (viewport.width >= 1650 && viewport.height >= 900) assert.equal(Math.round(initial.board.width), 820, `${path}: 820px board preserved`)
          assert.ok(initial.footer.top >= initial.boardColumn.bottom - 1, `${path}: footer follows the entire board column`)
          assert.ok(initial.footer.top >= initial.side.bottom - 1, `${path}: footer cannot overlay side panel`)
          if (initial.scrollHeight > initial.clientHeight + 1) {
            await page.mouse.move(initial.side.left + initial.side.width / 2, initial.side.top + initial.side.height / 2)
            await page.mouse.wheel(0, 400)
            await page.waitForFunction(() => document.querySelector('.trainer-shell-side').scrollTop > 0, null, { timeout: 3000 })
            assert.equal((await measure()).board.top, initial.board.top, `${path}: panel wheel scroll does not move board`)
          }
        }
        assert.ok((await side.innerText()).includes('Chunk navigation'), `${path}: chunk navigation retained`)
        const controls = side.locator('button, input, select, summary')
        let reached = 0
        for (let i = 0; i < await controls.count(); i++) {
          const control = controls.nth(i)
          if (!await control.isVisible()) continue
          await control.scrollIntoViewIfNeeded()
          const box = await control.boundingBox()
          const current = await measure()
          assert.ok(box.y >= -1 && box.y + box.height <= viewport.height + 1, `${path}: control ${i} reachable vertically`)
          if (viewport.width > 768) assert.ok(box.y >= current.side.top - 1 && box.y + box.height <= current.side.bottom + 1, `${path}: control ${i} inside panel viewport`)
          assert.ok(box.y + box.height <= current.footer.top + 1, `${path}: footer does not cover control ${i}`)
          if (await control.isEnabled()) await control.click({ trial: true, timeout: 3000 })
          reached++
        }
        assert.ok(reached >= 6, `${path}: all lower controls inspected`)
        console.log(`PASS ${viewport.width}x${viewport.height} ${path}: board=${Math.round(initial.board.width)}px, panel=${initial.clientHeight}/${initial.scrollHeight}px, ${reached} controls reachable; footer clear`)
      } finally { await context.close() }
    }
  }
  assert.deepEqual(errors, [])
  console.log('Puzzle trainer side-panel layout: PASS')
} finally {
  await browser.close()
  await new Promise(done => server.close(done))
}
