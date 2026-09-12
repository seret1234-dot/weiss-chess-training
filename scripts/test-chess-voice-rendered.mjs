import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const port = 4219
const bundle = await build({ entryPoints: ['scripts/voice-input-test-fixture.tsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env.DEV': 'true' } })
const server = createServer((req, res) => {
  if (req.url === '/voice-fixture.js') {
    res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text)
  } else {
    res.setHeader('Content-Type', 'text/html')
    res.end('<html><body><div id="root"></div><script type="module" src="/voice-fixture.js"></script></body></html>')
  }
})
let browser
try {
  console.log('Voice fixture: starting isolated server')
  await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done) })
  console.log('Voice fixture: launching test browser')
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${port}/__voice-test`)
  console.log('Voice fixture: page loaded')
  const mode = page.getByLabel('Input', { exact: true })
  assert.equal(await mode.inputValue(), 'mouse')
  await mode.selectOption('both')
  await page.getByRole('button', { name: 'New test position' }).click()
  await page.getByText('🎙 Listening', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Speech begins' }).click()
  await page.waitForTimeout(3300)
  await page.getByRole('button', { name: 'Final transcript' }).click()
  await page.getByText('Qualifying', { exact: true }).waitFor()
  assert.equal(await page.getByTestId('mouse').textContent(), 'Mouse enabled')
  await page.reload()
  assert.equal(await mode.inputValue(), 'both')
  await mode.selectOption('voice')
  assert.equal(await page.getByTestId('mouse').textContent(), 'Mouse disabled')
  await page.getByRole('button', { name: 'New test position' }).click()
  await page.getByText('🎙 Listening', { exact: true }).waitFor()
  await page.waitForTimeout(2200)
  await page.getByRole('button', { name: 'Speech begins' }).click()
  await page.getByRole('button', { name: 'Final transcript' }).click()
  await page.getByText('Not qualifying', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'New test position' }).click()
  await page.getByText('🎙 Listening', { exact: true }).waitFor()
  await page.getByLabel('Test transcript').fill('not a chess move')
  await page.getByRole('button', { name: 'Final transcript' }).click()
  await page.getByRole('status').filter({ hasText: 'No clear chess answer' }).waitFor()
  assert.equal(await page.getByTestId('result').textContent(), 'Ready')
  await page.getByText('🎙 Listening', { exact: false }).waitFor()
  await page.getByLabel('Test transcript').fill('e4')
  await page.getByRole('button', { name: 'Speech begins' }).click()
  await page.getByRole('button', { name: 'Final transcript', exact: true }).click()
  await page.getByText('Qualifying', { exact: true }).waitFor()

  const alternatives = page.getByLabel('Test alternatives')
  async function fresh() {
    await page.getByRole('button', { name: 'New test position' }).click()
    await page.getByText('🎙 Listening', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Speech begins' }).click()
  }
  async function submittedCount() { return Number(await page.getByTestId('submissions').textContent()) }
  await fresh()
  await alternatives.fill(JSON.stringify([{ transcript: 'queen e two', confidence: 0.99 }]))
  const beforeIllegal = await submittedCount()
  await page.getByRole('button', { name: 'Final alternatives', exact: true }).click()
  await page.getByTestId('result').filter({ hasText: 'Wrong, silent error' }).waitFor()
  await page.getByRole('status').filter({ hasText: 'Illegal move submitted' }).waitFor()
  await page.getByRole('status').filter({ hasText: 'Listening' }).waitFor()
  assert.equal(await submittedCount(), beforeIllegal, 'illegal voice never submits a board move')
  await alternatives.fill(JSON.stringify([{ transcript: 'e4', confidence: 0.99 }]))
  await page.getByRole('button', { name: 'Speech begins' }).click()
  await page.getByRole('button', { name: 'Final alternatives', exact: true }).click()
  await page.getByTestId('result').filter({ hasText: 'Not qualifying' }).waitFor()
  assert.equal(await submittedCount(), beforeIllegal + 1, 'listening continues; correct after Silent error cannot regain perfection')
  for (let slot = 1; slot < 5; slot++) {
    await fresh()
    const items = Array.from({ length: 5 }, () => ({ transcript: 'unmatched words', confidence: 0.99 }))
    items[slot] = { transcript: 'e4', confidence: 0.2 }
    await alternatives.fill(JSON.stringify(items))
    const before = await submittedCount()
    await page.getByRole('button', { name: 'Final alternatives', exact: true }).click()
    await page.getByText('Qualifying', { exact: true }).waitFor()
    assert.equal(await submittedCount(), before + 1, `alternative ${slot + 1} submitted`)
  }
  await fresh()
  await alternatives.fill(JSON.stringify([{ transcript: 'e4', confidence: 0.99 }, { transcript: 'd4', confidence: 0.1 }]))
  let before = await submittedCount()
  await page.getByRole('button', { name: 'Final alternatives', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Ambiguous alternatives' }).waitFor()
  assert.equal(await submittedCount(), before)
  await page.getByText('🎙 Listening', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Conflicting result batch', exact: true }).click()
  assert.equal(await submittedCount(), before, 'all result indices considered before submission')

  await fresh()
  await alternatives.fill(JSON.stringify([{ transcript: 'e4', confidence: 0.95 }]))
  before = await submittedCount()
  await page.getByRole('button', { name: 'Interim alternatives', exact: true }).click()
  await page.getByText('Qualifying', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Late final result', exact: true }).click()
  assert.equal(await submittedCount(), before + 1, 'interim followed by final submits once')
  await fresh()
  await page.getByRole('button', { name: 'Late final result', exact: true }).click()
  assert.equal(await submittedCount(), before + 1, 'old utterance cannot submit into next position')
  assert.equal(await page.getByTestId('result').textContent(), 'Ready')

  for (const item of [{ transcript: 'e4', confidence: 0.2 }, { transcript: 'e4' }, { transcript: 'e4 to', confidence: 1 }]) {
    await alternatives.fill(JSON.stringify([item]))
    await page.getByRole('button', { name: 'Interim alternatives', exact: true }).click()
    assert.equal(await page.getByTestId('result').textContent(), 'Ready', 'partial/low-confidence interim waits')
  }
  await alternatives.fill(JSON.stringify([{ transcript: 'e four' }, { transcript: 'pawn e4' }]))
  await page.getByRole('button', { name: 'Final alternatives', exact: true }).click()
  await page.getByText('Qualifying', { exact: true }).waitFor()

  await fresh()
  for (let cycle = 0; cycle < 12; cycle++) {
    await page.getByRole('button', { name: 'No speech and duplicate end', exact: true }).click()
    await page.getByText('🎙 Listening', { exact: true }).waitFor()
  }
  await page.getByRole('button', { name: 'Normal recognition end', exact: true }).click()
  await page.getByText('🎙 Listening', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Read provider stats', exact: true }).click()
  const stats = (await page.getByTestId('provider-stats').textContent()).split('/')
  assert.equal(stats[1], '0', 'no overlapping starts even with asynchronous abort and duplicate ends')
  assert.deepEqual(stats.slice(2), ['5', 'true'], 'provider receives alternatives/interim settings')
  await page.getByText('Speech recognition diagnostics', { exact: true }).click()
  assert.match(await page.locator('pre').textContent(), /recognition error: no-speech/)
  assert.match(await page.locator('pre').textContent(), /recognition restart scheduled/)
  await page.getByRole('button', { name: 'Deny microphone' }).click()
  await page.getByText(/Microphone permission denied/).waitFor()
  await page.getByRole('button', { name: 'Disable microphone' }).click()
  assert.equal(await mode.inputValue(), 'mouse')
  await page.goto(`http://127.0.0.1:${port}/__voice-test?unsupported=1`)
  await page.getByText('Voice recognition unavailable in this browser', { exact: true }).waitFor()
  assert.equal(await page.getByTestId('mouse').textContent(), 'Mouse enabled')
  assert.equal(await page.getByRole('option', { name: 'Experimental Browser Voice', exact: true }).isDisabled(), true)
  assert.deepEqual(errors, [])
  console.log('PASS rendered voice: alternatives 2–5; consensus/conflicts; interim/final exactly once; stale result; incomplete/low-confidence interim; async abort/no overlapping starts; 12 silence retries; normal end/no-match recovery; diagnostics; default/persistence, voice-only/both, speech-start timing, slow response, denial, mic stop, unsupported mouse fallback')
} catch (error) { console.error(error); throw error }
finally { await browser?.close(); server.closeAllConnections(); await new Promise(done => server.close(done)) }
