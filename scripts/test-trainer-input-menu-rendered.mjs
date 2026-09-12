import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { chromium } from 'playwright'

// Compile the actual shared menu and preference hook in both build modes.
// No microphone, credentials, transcription calls, or remote database access.
const bundles = new Map()
for (const development of [false, true]) {
  const result = await build({
    entryPoints: ['scripts/ai-voice-input-test-fixture.tsx'], bundle: true, write: false,
    format: 'esm', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': JSON.stringify(development ? 'development' : 'production'), 'import.meta.env.DEV': String(development) },
    plugins: [{ name: 'no-live-audio', setup(b) {
      b.onResolve({ filter: /\/useAiTranscription$/ }, () => ({ path: 'ai', namespace: 'menu-test' }))
      b.onLoad({ filter: /.*/, namespace: 'menu-test' }, () => ({ loader: 'js', contents: `
        export function useAiTranscription() { return {
          supported: !window.unsupportedAi, ready: false, retry() {},
          status: window.quotaExhausted ? 'AI Voice allowance used for today' : 'Microphone off',
          blocked: window.quotaExhausted ? 'VOICE_QUOTA_EXCEEDED' : '',
          quota: { tier: 'free', limit: 10, used: window.quotaExhausted ? 10 : 0, remaining: window.quotaExhausted ? 0 : 10 }
        } }
      ` }))
    } }],
  })
  bundles.set(development ? '/development.js' : '/production.js', result.outputFiles[0].text)
}
const server = createServer((req, res) => {
  if (bundles.has(req.url)) { res.setHeader('Content-Type', 'text/javascript'); res.end(bundles.get(req.url)); return }
  res.setHeader('Content-Type', 'text/html')
  const script = req.url === '/development' ? '/development.js' : '/production.js'
  res.end(`<div id="root"></div><script type="module" src="${script}"></script>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })
const key = 'weiss-chess-trainer-input-mode-v1'
const productionOptions = ['Mouse', 'AI Voice', 'Mouse + AI Voice']
const experimentalOptions = ['Experimental Browser Voice', 'Mouse + Experimental Browser Voice']
const errors = []
try {
  for (const development of [false, true]) {
    for (const saved of [null, 'voice', 'both', 'ai-voice', 'ai-both']) {
      const context = await browser.newContext()
      const page = await context.newPage()
      page.on('pageerror', e => errors.push(e.message))
      await page.addInitScript(({ key, saved }) => {
        window.recognitionStarts = 0
        window.SpeechRecognition = class { start() { window.recognitionStarts++; this.onstart?.() } abort() { this.onend?.() } }
        if (saved !== null && localStorage.getItem(key) === null) localStorage.setItem(key, saved)
      }, { key, saved })
      await page.goto(`${base}/${development ? 'development' : 'production'}`)
      const input = page.getByRole('combobox', { name: 'Input', exact: true })
      await input.waitFor()
      assert.deepEqual(await input.locator('option').allTextContents(), development ? [...productionOptions, ...experimentalOptions] : productionOptions)
      if (!development) assert.equal(await page.getByText('Speech recognition diagnostics', { exact: true }).count(), 0, 'detailed audio/transcription diagnostics remain development-only')
      const expected = !saved || (!development && ['voice', 'both'].includes(saved)) ? 'mouse' : saved
      assert.equal(await input.inputValue(), expected)
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), saved, 'reading a legacy preference does not overwrite storage')
      if (!development) {
        assert.equal(await page.evaluate(() => window.recognitionStarts), 0, 'production must not start hidden experimental recognition')
        if (expected === 'mouse') {
          await page.getByRole('button', { name: 'Enable microphone', exact: true }).click()
          assert.equal(await input.inputValue(), 'ai-both', 'microphone shortcut uses AI Voice, not hidden Browser Voice')
        }
      }
      for (const selected of ['ai-voice', 'ai-both', 'mouse']) {
        await input.selectOption(selected)
        await page.reload()
        assert.equal(await input.inputValue(), selected, `${selected} persists`)
      }
      await context.close()
    }
  }
  for (const unsupportedAi of [false, true]) {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    await page.addInitScript(({ key, unsupportedAi }) => {
      window.unsupportedAi = unsupportedAi
      window.quotaExhausted = !unsupportedAi
      window.SpeechRecognition = class { start() { throw Error('Hidden browser fallback started') } abort() {} }
      localStorage.setItem(key, unsupportedAi ? 'mouse' : 'ai-both')
    }, { key, unsupportedAi })
    await page.goto(`${base}/production`)
    const input = page.getByRole('combobox', { name: 'Input', exact: true })
    await input.waitFor()
    assert.deepEqual(await input.locator('option').allTextContents(), productionOptions)
    assert.doesNotMatch(await page.locator('body').innerText(), /Experimental Browser Voice/)
    if (unsupportedAi) assert.equal(await page.getByRole('button', { name: 'Enable microphone', exact: true }).isDisabled(), true)
    else {
      await page.getByText('0 / 10 free uses remaining today', { exact: true }).waitFor()
      assert.equal(await page.getByRole('link', { name: 'Upgrade', exact: true }).count(), 1)
      assert.doesNotMatch(await input.innerText(), /quota|remaining|Upgrade|GPT|model/i, 'quota messaging stays outside dropdown')
    }
    await context.close()
  }
  assert.deepEqual(errors, [])
  console.log('PASS rendered Input menu: exact production options; development experimental options retained; Mouse default; saved-mode safety/persistence; AI shortcut; no hidden Browser Voice fallback; quota messaging separate')
} finally {
  await browser.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
