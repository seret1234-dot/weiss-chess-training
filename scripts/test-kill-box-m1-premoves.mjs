import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Chess, validateFen } from 'chess.js'
import { classifyKillBoxStoredPuzzle } from './lib/kill-box-subpattern-assignment.mjs'

const root = process.cwd()
const json = async file => JSON.parse(await readFile(resolve(root, file), 'utf8'))
const rows = payload => Array.isArray(payload) ? payload : payload.puzzles
async function course(directory) {
  const manifest = await json(`${directory}/manifest.json`)
  const chunks = await Promise.all(manifest.files.map(async file => ({ file, records: rows(await json(`${directory}/${file}`)) })))
  return { manifest, chunks, records: chunks.flatMap(chunk => chunk.records) }
}
const original = await course('public/data/pattern-mates/kill-box/mate-in-1')
const originals = new Map(original.records.map(record => [record.id, record]))
const cases = []
for (const [subtype, count] of [['adjacent-rook', 881], ['rook-rail', 296], ['queen-fence', 190]]) {
  const slug = `kill-box-${subtype}`
  const generated = await course(`public/data/pattern-mates/${slug}/mate-in-1`)
  const directory = `public/data/full-curricula-v1/pattern-mates/${slug}/mate-in-1`
  const active = await course(directory)
  assert.equal(active.records.length, count)
  assert.equal(active.manifest.totalPuzzles, count)
  assert.deepEqual(active.manifest.files, generated.manifest.files, `${slug}: chunk membership retained`)
  assert.deepEqual(active.chunks, generated.chunks, `${slug}: restored active payload retains all source setup fields`)
  const ids = new Set()
  for (const record of active.records) {
    assert.ok(!ids.has(record.id), `${record.id}: unique progress identity`)
    ids.add(record.id)
    const source = originals.get(record.id)
    assert.ok(source, `${record.id}: original source exists`)
    for (const field of ['id', 'puzzleId', 'fen', 'initialFen', 'preMove', 'solutionLine', 'userMoveIndexes']) {
      assert.deepEqual(record[field], source[field], `${record.id}: ${field} unchanged from original Kill Box source`)
    }
    assert.equal(validateFen(record.fen).ok, true, `${record.id}: valid starting FEN`)
    assert.match(record.preMove ?? '', /^[a-h][1-8][a-h][1-8][qrbn]?$/, `${record.id}: source setup move exists`)
    const board = new Chess(record.fen)
    assert.ok(board.move(record.preMove), `${record.id}: legal automatic premove`)
    const learnerFen = board.fen()
    const sourceBoard = new Chess(source.fen)
    sourceBoard.move(source.preMove)
    assert.equal(learnerFen, sourceBoard.fen(), `${record.id}: exact intended post-setup position`)
    assert.deepEqual(record.userMoveIndexes, [0], `${record.id}: setup is not a learner move`)
    assert.equal(record.solutionLine.length, 1)
    assert.ok(board.move(record.solutionLine[0]), `${record.id}: legal learner solution`)
    assert.equal(board.isCheckmate(), true, `${record.id}: solution is mate in one`)
    assert.equal(classifyKillBoxStoredPuzzle(record).classification, subtype, `${record.id}: mating geometry retained`)
    if (subtype === 'queen-fence' || cases.every(item => item.slug !== slug)) cases.push({ slug, record, learnerFen,
      next: record === active.records[0] ? active.records.find(other => {
        const next = new Chess(other.fen); next.move(other.preMove)
        return next.turn() !== sourceBoard.turn()
      }) : undefined })
  }
  console.log(`PASS ${slug}: ${count}/${count} legal source premoves, M1 solutions, unchanged identities/chunks and subtype`)
}

if (process.argv.includes('--rendered')) {
  // Exercise the real production build and existing trainer, not a replacement
  // component. Only the served chunk is reduced to choose each source exercise.
  const { preview } = await import('vite')
  const { chromium } = await import('playwright')
  const { installAiVoiceMock, sayAi } = await import('./ai-voice-rendered-support.mjs')
  const aiTest = process.argv.includes('--ai')
  const server = await preview({ preview: { host: '127.0.0.1', port: 4195, strictPort: true } })
  const browser = await chromium.launch({ headless: true })
  const position = fen => new Chess(fen).board().flat().filter(Boolean).map(p => `${p.square}:${p.color}${p.type.toUpperCase()}`).sort().join('|')
  const errors = []
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    if (aiTest) await installAiVoiceMock(page)
    let transcriptions = 0
    page.on('request', request => {
      if (request.url().includes('/api/chess-voice-transcribe') && request.method() === 'POST') transcriptions++
    })
    page.on('pageerror', error => errors.push(error.message))
    let current
    await page.route('**/data/full-curricula-v1/pattern-mates/*/mate-in-1/chunk-001.json', route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify(current.next ? [current.record, current.next] : [current.record]),
    }))
    await page.addInitScript(() => {
      const fixtureAuthKey = 'sb-lahzgtcpbshmzsqoqswf-auth-token'
      const fixtureAuth = localStorage.getItem(fixtureAuthKey)
      localStorage.clear() // Disposable local browser context only; no real user progress.
      if (fixtureAuth) localStorage.setItem(fixtureAuthKey, fixtureAuth)
      window.__premoveFrames = []
      window.__premoveNow = 0
      window.__WEISS_PERFECTION_TEST_NOW = 0
      Object.defineProperty(performance, 'now', { configurable: true, value: () => window.__premoveNow })
      const sample = () => {
        const board = document.querySelector('.trainer-shell-custom-board-slot .accessible-chessboard')
        const controls = document.querySelector('.trainer-puzzle-panel-controls')
        if (board && controls) {
        const frame = {
          at: Date.now(),
          visible: board.checkVisibility(),
          moving: [...board.querySelectorAll('[data-piece]')].some(piece => {
            const transform = getComputedStyle(piece).transform
            return transform !== 'none' && !new DOMMatrixReadOnly(transform).isIdentity
          }),
          pieces: [...board.querySelectorAll('[data-square]')].flatMap(square => {
            const piece = square.querySelector('[data-piece]')?.getAttribute('data-piece')
            return piece ? [`${square.getAttribute('data-square')}:${piece}`] : []
          }).sort().join('|'),
          feedback: controls.querySelector('[role="status"]')?.textContent,
          message: controls.querySelector('[role="status"]')?.lastElementChild?.textContent,
          counter: controls.querySelector('[aria-label^="Current puzzle"]')?.textContent,
          hintDisabled: [...controls.querySelectorAll('button')].find(b => b.textContent === 'Hint')?.disabled,
          controlsLocked: ['Hint', 'Silent error', 'Next Puzzle', 'Restart progression'].every(label =>
            [...controls.querySelectorAll('button')].find(b => b.textContent === label)?.disabled === true),
          credit: controls.textContent.match(/\d+ \/ 5 fast solves/)?.[0],
          side: controls.textContent.match(/(?:White|Black) to Move/)?.[0],
          firstSquare: board.querySelector('[data-square]')?.getAttribute('data-square'),
        }
        window.__premoveFrames.push(frame)
        const setupKey = `${frame.counter}:${frame.pieces}`
        if (frame.message === 'Opponent move...' && window.__lastSetupProbe !== setupKey) {
          window.__lastSetupProbe = setupKey
          // Simulated long setup must NOT start the learner's reaction clock.
          window.__premoveNow += 5000
          if (window.__probeMove) {
            // DOM input during both source display and setup animation must be
            // ignored. Disabled buttons must not skip, reset, hint or penalize.
            for (const label of ['Hint', 'Silent error', 'Next Puzzle', 'Restart progression']) {
              [...controls.querySelectorAll('button')].find(b => b.textContent === label)?.click()
            }
            board.querySelector(`[data-square="${window.__probeMove.slice(0, 2)}"]`)?.click()
            board.querySelector(`[data-square="${window.__probeMove.slice(2, 4)}"]`)?.click()
          }
        }
        }
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    let checked = 0
    const renderedCases = process.argv.includes('--sample') ? cases.filter(item => item.next) : cases
    for (current of renderedCases) {
      await page.goto(`http://127.0.0.1:4195/mates/m1/${current.slug}`, { waitUntil: 'commit' })
      try {
        await page.getByText('Find the mate in 1', { exact: true }).waitFor({ timeout: 20_000 })
      } catch (error) {
        throw new Error(`${current.record.id}: ${error.message}\n${await page.locator('body').innerText()}\n${errors.join('\n')}`)
      }
      await page.waitForFunction(() => window.__premoveFrames.some(f => f.feedback?.includes('Find the mate in 1')))
      const frames = await page.evaluate(() => window.__premoveFrames)
      const source = frames.find(f => f.pieces === position(current.record.fen) && f.feedback?.includes('Opponent move'))
      const prepared = frames.find(f => f.pieces === position(current.learnerFen) && f.feedback?.includes('Opponent move'))
      const ready = frames.find(f => f.feedback?.includes('Find the mate in 1'))
      assert.ok(source, `${current.record.id}: source board is visibly shown on initial load`)
      assert.ok(prepared, `${current.record.id}: existing automatic premove renders before answer entry`)
      assert.ok(prepared.at > source.at && ready.at > prepared.at)
      assert.equal(prepared.hintDisabled, true, `${current.record.id}: setup is still locked`)
      assert.equal(ready.hintDisabled, false, `${current.record.id}: controls unlock after setup`)
      assert.equal(ready.pieces, position(current.learnerFen))
      await page.getByText('0 / 5 fast solves', { exact: true }).waitFor()
      if (aiTest) {
        await page.getByRole('combobox', { name: 'Input', exact: true }).selectOption('ai-both')
        await page.getByText('🎙 Listening', { exact: true }).waitFor()
      }
      if (current.next) for (const [record, next, nextCounter, nextCredit] of [
        [current.record, current.next, 'Puzzle 2 / 2', '0 / 5 fast solves'],
        [current.next, current.record, 'Puzzle 1 / 2', '1 / 5 fast solves'],
      ]) {
        await page.evaluate(probeMove => {
          window.__premoveFrames = []
          window.__probeMove = probeMove
          window.__premoveNow += 1900
        }, next.solutionLine[0])
        const move = record.solutionLine[0]
        const board = page.locator('.trainer-shell-custom-board-slot .accessible-chessboard')
        await board.locator(`[data-square="${move.slice(0, 2)}"]`).click()
        await board.locator(`[data-square="${move.slice(2, 4)}"]`).click()
        await page.getByText('Correct', { exact: true }).waitFor()
        await page.getByText('1 / 5 fast solves', { exact: true }).waitFor()
        await page.getByText(nextCounter, { exact: true }).waitFor()
        if (aiTest) {
          await page.getByText('Microphone paused', { exact: true }).waitFor()
          await sayAi(page, 'queen e2')
          assert.equal(transcriptions, 0, 'setup audio never submitted for transcription or scoring')
        }
        await page.getByText('Find the mate in 1', { exact: true }).waitFor()
        await page.waitForFunction(counter => window.__premoveFrames.some(f => f.counter === counter && f.message === 'Find the mate in 1'), nextCounter)
        const nextBoard = new Chess(next.fen)
        nextBoard.move(next.preMove)
        const transition = await page.evaluate(() => window.__premoveFrames)
        const success = transition.find(f => f.message === 'Correct')
        const nextFrames = transition.filter(f => f.counter === nextCounter)
        const nextFrame = nextFrames[0]
        const nextReady = nextFrames.find(f => f.message === 'Find the mate in 1')
        assert.ok(success && nextFrame, `${current.slug}: completion and next puzzle rendered`)
        assert.ok(nextFrame.at - success.at >= 1900 && nextFrame.at - success.at < 2300, `${current.slug}: approved ~2s transition`)
        assert.equal(nextFrame.pieces, position(next.fen), `${current.slug}: atomic transition to next SOURCE board`)
        assert.equal(nextFrame.message, 'Opponent move...')
        assert.ok(nextFrames.some(f => f.moving && f.message === 'Opponent move...'), `${current.slug}: premove visibly animates`)
        assert.ok(nextFrames.some(f => f.pieces === position(nextBoard.fen()) && f.message === 'Opponent move...'), `${current.slug}: prepared board remains locked until setup completes`)
        for (const frame of nextFrames.filter(f => f.at < nextReady.at)) {
          assert.equal(frame.controlsLocked, true, `${current.slug}: all puzzle actions locked throughout setup`)
          assert.equal(frame.credit, nextCredit, `${current.slug}: no setup credit/error/reset`)
          assert.equal(frame.visible, true)
          assert.equal(frame.side, `${nextBoard.turn() === 'w' ? 'White' : 'Black'} to Move`)
          assert.equal(frame.firstSquare, nextBoard.turn() === 'w' ? 'a8' : 'h1')
        }
        assert.equal(nextReady.pieces, position(nextBoard.fen()))
        assert.equal(nextReady.hintDisabled, false)
        assert.ok(nextReady.at - nextFrame.at >= 700, `${current.slug}: existing 320ms + 450ms setup delays retained`)
        if (aiTest) await page.getByText('🎙 Listening', { exact: true }).waitFor()
        assert.ok(transition.filter(f => f.at >= success.at && f.at < nextFrame.at).every(f => !f.feedback?.includes('Opponent move')),
          `${current.slug}: completed old puzzle remains until the atomic source swap`)
        console.log(`PASS ${current.slug} -> ${nextCounter}: source swap ${Math.round(nextFrame.at - success.at)}ms; animated locked setup ${nextReady.at - nextFrame.at}ms; attempted setup input ignored; timing starts after setup`)
      }
      if (++checked % 20 === 0 || checked === renderedCases.length) console.log(`PASS rendered initial premove ${checked}/${renderedCases.length}`)
    }
    assert.deepEqual(errors, [], 'no rendered trainer exceptions')
  } finally {
    await browser.close()
    await new Promise(resolveClose => server.httpServer.close(resolveClose))
  }
}
