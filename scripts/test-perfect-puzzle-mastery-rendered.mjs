import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { join, resolve } from 'node:path'
import { Chess } from 'chess.js'
import { chromium } from 'playwright'
import { installAiVoiceMock, sayAi } from './ai-voice-rendered-support.mjs'

const root = process.cwd()
const host = '127.0.0.1'
const vitePort = 4207
const proxyPort = 4208
const viteUrl = `http://${host}:${vitePort}`
const liveBaseUrl = process.env.RELEASE_FEEDBACK_BASE_URL
const aiVoiceTest = process.argv.includes('--ai-voice-only')
const baseUrl = liveBaseUrl ?? `http://${host}:${proxyPort}`
const masterRoot = resolve(root, 'public/data/master-puzzles/v1')
const masterUrlMarker = '/storage/v1/object/public/master-puzzles/v1/v1/'
const timedMasteryStorageKey = 'weiss-chess-timed-mastery-enabled-v1'

await access(chromium.executablePath())

async function readJson(relative) {
  return JSON.parse(await readFile(join(masterRoot, ...relative.split('/')), 'utf8'))
}

async function fixture(indexName) {
  const index = await readJson(`indexes/${indexName}`)
  const ref = index.refs[0]
  const shardName = `puzzles/chunk-${String(ref.chunk).padStart(5, '0')}.json`
  const shard = await readJson(shardName)
  const puzzle = shard.puzzles.find((candidate) => candidate.id === ref.id)
  assert.ok(puzzle, `${ref.id} exists in ${shardName}`)
  return { ref, shardName, puzzle }
}

const tacticFixture = await fixture('tactics-course-2-bishop-fork.json')
const mateFixture = await fixture('mates-theme-1-smothered.json')

// Existing authoritative regular fixtures, reduced only in intercepted test responses.
const regularFixtures = []
const regularChunks = new Map()
for (const [path, chunkPath] of [
  ['/mates/m1/back-rank', '/data/full-curricula-v1/pattern-mates/back-rank/mate-in-1/chunk-001.json'],
  ['/tactics/m1/bishop-fork', '/data/full-curricula-v1/pattern-tactics/bishop-fork/m1/chunk-001.json'],
]) {
  const chunk = JSON.parse(await readFile(join(root, 'public', chunkPath), 'utf8'))
  const puzzle = (Array.isArray(chunk) ? chunk : chunk.puzzles)[0]
  regularChunks.set(chunkPath, Array.isArray(chunk) ? [puzzle] : { ...chunk, puzzles: [puzzle] })
  const board = new Chess(puzzle.fen)
  if (puzzle.preMove) board.move(puzzle.preMove)
  regularFixtures.push({ path, fen: board.fen(), moves: puzzle.solutionLine ?? [puzzle.solution] })
}

const singleRefIndexes = new Map([
  ['indexes/tactics-course-2-bishop-fork.json', { distance: 2, theme: 'bishop-fork', refs: [tacticFixture.ref] }],
  ['indexes/mates-theme-1-smothered.json', { distance: 1, theme: 'smothered', refs: [mateFixture.ref] }],
])

const vite = liveBaseUrl ? null : spawn(process.execPath, [
  resolve(root, 'node_modules/vite/bin/vite.js'),
  'preview', '--host', host, '--port', String(vitePort), '--strictPort',
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let viteOutput = ''
vite?.stdout.on('data', (chunk) => { viteOutput += chunk })
vite?.stderr.on('data', (chunk) => { viteOutput += chunk })

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(viteUrl)
      if (response.ok) return
    } catch {}
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(`Vite did not become ready:\n${viteOutput}`)
}

function createProxy() {
  return createServer((clientRequest, clientResponse) => {
    const upstream = request({
      hostname: host,
      port: vitePort,
      path: clientRequest.url,
      method: clientRequest.method,
      headers: clientRequest.headers,
    }, (response) => {
      const headers = { ...response.headers }
      delete headers['cross-origin-opener-policy']
      delete headers['cross-origin-embedder-policy']
      clientResponse.writeHead(response.statusCode ?? 502, headers)
      response.pipe(clientResponse)
    })
    upstream.on('error', (error) => clientResponse.destroy(error))
    clientRequest.pipe(upstream)
  })
}

function masterRelative(url) {
  if (url.includes(masterUrlMarker)) {
    return decodeURIComponent(url.split(masterUrlMarker)[1].split('?')[0])
  }
  const localMarker = '/data/master-puzzles/v1/'
  if (url.includes(localMarker)) {
    return decodeURIComponent(url.split(localMarker)[1].split('?')[0])
  }
  return null
}

async function preparePage(context, { timedMasteryEnabled } = {}) {
  const page = await context.newPage()
  await page.addInitScript(({ storageKey, storedValue }) => {
    window.__WEISS_PERFECTION_TEST_NOW = 0
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => window.__WEISS_PERFECTION_TEST_NOW,
    })
    if (storedValue !== null) window.localStorage.setItem(storageKey, storedValue)
  }, {
    storageKey: timedMasteryStorageKey,
    storedValue: timedMasteryEnabled === undefined ? null : String(timedMasteryEnabled),
  })
  if (!liveBaseUrl) await page.route('**/*', async (route) => {
    const regular = regularChunks.get(new URL(route.request().url()).pathname)
    if (regular) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(regular) })
    const relative = masterRelative(route.request().url())
    if (!relative) return route.continue()
    const override = singleRefIndexes.get(relative)
    const body = override
      ? JSON.stringify(override)
      : await readFile(join(masterRoot, ...relative.split('/')))
    await route.fulfill({ status: 200, contentType: 'application/json', body })
  })
  return page
}

async function setNow(page, now) {
  await page.evaluate((value) => { window.__WEISS_PERFECTION_TEST_NOW = value }, now)
}

async function boardPoint(page, square, orientation = 'white') {
  const board = page.locator('.trainer-shell-custom-board-slot').first()
  // Side-panel actions can scroll a stacked trainer; return to its visible board.
  await board.scrollIntoViewIfNeeded()
  const box = await board.boundingBox()
  assert.ok(box && box.width > 250 && box.height > 250, 'rendered board has measurable dimensions')
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1])
  const displayFile = orientation === 'white' ? file : 7 - file
  const displayRank = orientation === 'white' ? 8 - rank : rank - 1
  return {
    x: box.x + (displayFile + 0.5) * box.width / 8,
    y: box.y + (displayRank + 0.5) * box.height / 8,
  }
}

async function clickSquare(page, square, orientation = 'white', touch = false) {
  const point = await boardPoint(page, square, orientation)
  if (touch) await page.touchscreen.tap(point.x, point.y)
  else await page.mouse.click(point.x, point.y)
}

async function dragSquare(page, source, target, orientation = 'white', sourceAt = 1_000, dropAt = 5_000) {
  const from = await boardPoint(page, source, orientation)
  const to = await boardPoint(page, target, orientation)
  await page.mouse.move(from.x, from.y)
  await setNow(page, sourceAt)
  await page.mouse.down()
  await page.mouse.move(from.x + 24, from.y + 24, { steps: 4 })
  // Let the browser dispatch dragstart before a same-square cancellation/drop.
  await page.waitForTimeout(80)
  await setNow(page, dropAt)
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

async function waitTrainer(page, path, expectedCount = 0) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'commit' })
  await page.locator('.trainer-shell-page').waitFor({ state: 'visible', timeout: 60_000 })
  await page.getByText(new RegExp(`${expectedCount} \\/ 5 fast solves`)).waitFor({ state: 'visible', timeout: 60_000 })
  const feedbackSnapshot = await page.waitForFunction(() => {
    const status = document.querySelector('.trainer-puzzle-panel-controls [role="status"]')
    return status?.children.length ? { children: status.children.length, text: status.textContent } : null
  })
  const feedback = await feedbackSnapshot.jsonValue()
  await feedbackSnapshot.dispose()
  assert.equal(feedback.children, 1, `${path}: instruction remains without a speed-badge row or placeholder`)
  assert.doesNotMatch(feedback.text, /\bFast\b/, `${path}: no standalone Fast feedback label`)
  // Authenticated quota hydration may replace the initial board. Read the board
  // and its linked description in the same DOM snapshot, not across remounts.
  const descriptionSnapshot = await page.waitForFunction(() => {
    const board=document.querySelector('[role="group"][aria-label$="chessboard"]')
    const id=board?.getAttribute('aria-describedby')
    return id&&document.getElementById(id)?.textContent
  })
  const description = await descriptionSnapshot.jsonValue()
  await descriptionSnapshot.dispose()
  assert.ok(description, `${path} board has a description before solving`)
  const hiddenMoves = learnerMoves(path.includes('master-mates') ? mateFixture.puzzle : tacticFixture.puzzle)
  for (const move of hiddenMoves) {
    assert.doesNotMatch(description || '', new RegExp(move, 'i'), `${path} does not expose expected UCI ${move}`)
  }
  assert.doesNotMatch(description || '', /expected (?:source|destination|move)|correct move|solution line|mate line/i, `${path} description contains no solution language`)
}

function learnerMoves(puzzle) {
  return puzzle.solution.filter((move) => move.side === 'learner').map((move) => move.uci)
}

async function solveTactic(page, { firstSourceAt = 1_000, firstDropAt = firstSourceAt + 10, drag = false, laterMoveDelay = 1_000, feedback = 'Correct' } = {}) {
  const moves = learnerMoves(tacticFixture.puzzle)
  assert.deepEqual(moves, ['c3f6', 'f6h4'])
  if (drag) await dragSquare(page, 'c3', 'f6', 'white', firstSourceAt, firstDropAt)
  else {
    await setNow(page, firstSourceAt)
    await clickSquare(page, 'c3')
    await clickSquare(page, 'f6')
  }
  await page.getByText('Find move 2 of 2', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
  const secondActiveAt = await page.evaluate(() => performance.now())
  await setNow(page, secondActiveAt + laterMoveDelay)
  await clickSquare(page, 'f6')
  await clickSquare(page, 'h4')
  await page.getByText(feedback, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
}

async function runTacticScenario(
  browser,
  scenario,
  expectedCount,
  viewport = { width: 1920, height: 1080 },
  timedMasteryEnabled,
) {
  const context = await browser.newContext({ viewport })
  const page = await preparePage(context, { timedMasteryEnabled })
  await waitTrainer(page, '/master-tactics/2/bishop-fork')
  await scenario(page)
  await page.getByText(new RegExp(`${expectedCount} \\/ 5 fast solves`)).waitFor({ state: 'visible' })
  await context.close()
}

let browser
let proxy
const errors = []

async function runIntentMatrix(browser) {
  const fixtures = [
    ...regularFixtures,
    { path: '/master-mates/1/smothered', fen: mateFixture.puzzle.fen, moves: learnerMoves(mateFixture.puzzle) },
    { path: '/master-tactics/2/bishop-fork', fen: tacticFixture.puzzle.fen, moves: learnerMoves(tacticFixture.puzzle) },
  ]
  for (const data of fixtures) {
    const board = new Chess(data.fen)
    const orientation = board.turn() === 'w' ? 'white' : 'black'
    const source = data.moves[0].slice(0, 2)
    const target = data.moves[0].slice(2, 4)
    const acceptedSources = new Set([source])
    if (data.path.includes('mates/1/') || data.path.includes('mates/m1/')) {
      for (const move of board.moves({ verbose: true })) {
        const replay = new Chess(board.fen())
        replay.move(move)
        if (replay.isCheckmate()) acceptedSources.add(move.from)
      }
    }
    const wrongPiece = board.board().flat().find(p => p?.color === board.turn() && !acceptedSources.has(p.square))?.square
    const legalDestinations = new Set(board.moves({ verbose: true }).filter(move => move.from === source).map(move => move.to))
    // An unsubmitted/illegal destination is a silent intent error; submitted legal
    // wrong moves are exercised independently by the submitted-wrong scenario.
    const empty = board.board().flatMap((row, rank) => row.map((p, file) => !p ? `${String.fromCharCode(97 + file)}${8 - rank}` : null)).find(s => s && s !== target && !legalDestinations.has(s))
    assert.ok(wrongPiece && empty, `${data.path}: wrong piece and empty-square fixtures exist`)
    let checked = 0
    for (const scenario of ['correct', 'submitted-wrong', 'silent-error', 'wrong-piece', 'wrong-destination', 'empty', 'deselect', 'hint', 'slow', 'drag-correct', 'drag-wrong-piece', 'drag-wrong-destination', 'drag-cancel']) {
      if (process.argv.includes('--release-smoke') && !['correct', 'submitted-wrong', 'wrong-piece', 'wrong-destination', 'empty', 'deselect', 'hint'].includes(scenario)) continue
      const filter = process.argv.find(arg => arg.startsWith('--intent-scenario='))?.split('=')[1]
      if (filter && scenario !== filter) continue
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
      const page = await preparePage(context)
      page.on('pageerror', error => errors.push(`${data.path}: ${error.message}`))
      try {
        await waitTrainer(page, data.path)
        await page.getByText(/^Find (?:the (?:mate|tactic)|move)/).waitFor({ state: 'visible', timeout: 15_000 })
        assert.equal(await page.locator('.global-floating-hint').count(), 0, `${data.path}: no redundant floating hint`)
        await setNow(page, 400)
        if (scenario === 'silent-error') await page.getByRole('button', { name: 'Silent error', exact: true }).click()
        if (scenario === 'submitted-wrong') {
          const wrong = board.moves({ verbose: true }).find(move => {
            if (move.from !== source || move.to === target) return false
            const replay = new Chess(board.fen())
            replay.move(move)
            return !replay.isCheckmate()
          })
          assert.ok(wrong, `${data.path}: legal incorrect move fixture exists`)
          await clickSquare(page, wrong.from, orientation)
          await clickSquare(page, wrong.to, orientation)
        }
        if (scenario === 'empty') await clickSquare(page, empty, orientation)
        if (scenario === 'deselect') {
          await clickSquare(page, source, orientation)
          await clickSquare(page, source, orientation)
        }
        if (scenario === 'wrong-piece') {
          await clickSquare(page, wrongPiece, orientation)
          await clickSquare(page, wrongPiece, orientation)
        }
        if (scenario === 'wrong-destination') {
          await clickSquare(page, source, orientation)
          await clickSquare(page, empty, orientation)
        }
        if (scenario === 'drag-wrong-piece') await dragSquare(page, wrongPiece, wrongPiece, orientation, 400, 500)
        if (scenario === 'drag-wrong-destination') await dragSquare(page, source, empty, orientation, 400, 500)
        if (scenario === 'drag-cancel') await dragSquare(page, source, source, orientation, 400, 500)
        if (scenario.includes('wrong') || scenario === 'silent-error') {
          const feedback = scenario === 'submitted-wrong'
            ? 'Wrong move — try again.' : 'Wrong, silent error'
          await page.getByText(feedback, { exact: true }).waitFor({ state: 'visible' })
          await page.waitForTimeout(3_100)
          assert.equal(await page.getByText(feedback, { exact: true }).isVisible(), true, `${data.path}/${scenario}: exact feedback remains after 3s`)
          assert.equal(await page.getByRole('button', { name: 'Hint', exact: true }).isEnabled(), true, `${data.path}: retry controls available while error text remains`)
          const closeCoach = page.getByRole('button', { name: 'Close coach note', exact: true })
          if (await closeCoach.isVisible()) await closeCoach.click()
        }
        if (scenario === 'hint') {
          await page.getByRole('button', { name: 'Hint', exact: true }).click()
          assert.match(await page.locator('style[data-global-hint-highlights]').textContent(), new RegExp(source))
          await page.getByRole('button', { name: 'Hint', exact: true }).click()
          assert.match(await page.locator('style[data-global-hint-highlights]').textContent(), new RegExp(target))
          assert.equal(await page.locator('.global-floating-hint').count(), 0)
          assert.doesNotMatch((await page.getByRole('status').allTextContents()).join(' '), /Silent error|Wrong/)
        }
        for (const [index, move] of data.moves.entries()) {
          // The initial test clock is 400ms: +1500 tests a 1900ms first move.
          const now = (await page.evaluate(() => performance.now())) + (scenario === 'slow' && index === 0 ? 5_000 : scenario === 'correct' && index === 0 ? 1_500 : 600)
          if (scenario === 'drag-correct') await dragSquare(page, move.slice(0, 2), move.slice(2, 4), orientation, now, now + 100)
          else {
            await setNow(page, now)
            await clickSquare(page, move.slice(0, 2), orientation)
            await clickSquare(page, move.slice(2, 4), orientation)
          }
          if (index + 1 < data.moves.length) await page.getByText(`Find move ${index + 2} of ${data.moves.length}`, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
        }
        const successFeedback = scenario === 'slow' ? 'Correct, but slow' : 'Correct'
        await page.getByText(successFeedback, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
        const expected = scenario.includes('wrong') || scenario === 'silent-error' || scenario === 'hint' || scenario === 'slow' ? 0 : 1
        assert.equal(await page.getByText(`${expected} / 5 fast solves`, { exact: true }).isVisible(), true, `${data.path}/${scenario}: actual perfect counter`)
        if (scenario === 'correct' || scenario === 'slow') {
          const success = page.getByText(successFeedback, { exact: true })
          assert.equal(await success.isVisible(), true, `${data.path}: exact learner-facing success wording`)
          await page.waitForTimeout(1_750)
          assert.equal(await success.isVisible(), true, `${data.path}: success remains through the two-second reading window`)
          await success.waitFor({ state: 'hidden', timeout: 5000 })
          await page.getByText(/^Find (?:the (?:mate|tactic)|move)/).waitFor({ state: 'visible', timeout: 5000 })
        }
        if (scenario === 'slow') assert.doesNotMatch((await page.getByRole('status').allTextContents()).join(' '), /Silent error|Wrong/)
        checked += 1
        } catch (error) {
          throw new Error(`${data.path}/${scenario}: ${error.message}; feedback=${JSON.stringify(await page.getByRole('status').allTextContents())}`)
      } finally {
        await context.close()
      }
    }
    console.log(`PASS: ${data.path} — ${checked} click/drag intent, feedback, Hint and actual-credit scenarios`)
  }
}
async function runVoiceAnswerMatrix(browser) {
  assert.ok(!liveBaseUrl, 'synthetic speech events are local-only')
  const fixtures = [
    ...regularFixtures,
    { path: '/master-mates/1/smothered', fen: mateFixture.puzzle.fen, moves: learnerMoves(mateFixture.puzzle) },
    { path: '/master-tactics/2/bishop-fork', fen: tacticFixture.puzzle.fen, moves: learnerMoves(tacticFixture.puzzle) },
  ]
  const silentParity = new Map()
  for (const data of fixtures) for (const scenario of ['correct', 'legal-wrong', 'silent-button', 'illegal-silent', 'uncertain']) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
    const page = await preparePage(context)
    page.on('pageerror', error => errors.push(`${data.path}/voice-${scenario}: ${error.message}`))
    // Production exposes AI Voice only; development builds retain Browser Voice.
    await installAiVoiceMock(page)
    let useAiVoice = aiVoiceTest
    await page.addInitScript(() => {
      class Recognition {
        start() { window.__voiceAnswerRecognition = this; this.onstart?.() }
        abort() { this.onend?.() }
      }
      window.SpeechRecognition = Recognition
    })
    try {
      await waitTrainer(page, data.path)
      useAiVoice ||= await page.getByRole('option', { name: 'Experimental Browser Voice', exact: true }).count() === 0
      await page.getByLabel('Input', { exact: true }).selectOption(useAiVoice ? 'ai-both' : 'both')
      const listening = () => page.getByRole('status').filter({ hasText: '🎙 Listening' }).waitFor()
      await listening()
      const boardPieces = () => page.locator('[role="group"][aria-label$="chessboard"]').first().locator('[data-square]').evaluateAll(squares => squares.flatMap(square => {
        const piece = square.querySelector('[data-piece]')?.getAttribute('data-piece')
        return piece ? [`${square.getAttribute('data-square')}:${piece}`] : []
      }).sort().join('|'))
      const preparedPieces = new Chess(data.fen).board().flat().filter(Boolean).map(piece => `${piece.square}:${piece.color}${piece.type.toUpperCase()}`).sort().join('|')
      // Capture the fully prepared learner position, not the initial mount frame
      // before react-chessboard has painted the regular Tactic setup move.
      await page.waitForFunction(expected => [...document.querySelectorAll('[role="group"][aria-label$="chessboard"] [data-square]')].flatMap(square => {
        const piece = square.querySelector('[data-piece]')?.getAttribute('data-piece')
        return piece ? [`${square.getAttribute('data-square')}:${piece}`] : []
      }).sort().join('|') === expected, preparedPieces, { timeout: 3000 })
      const initialPieces = await boardPieces()
      async function say(transcript, confidence = 0.99) {
        if(useAiVoice) return sayAi(page,transcript)
        await setNow(page, (await page.evaluate(() => performance.now())) + 200)
        await page.evaluate(({ transcript, confidence }) => {
          const recognition = window.__voiceAnswerRecognition
          window.__submittedVoiceRecognition = recognition
          recognition.onspeechstart?.()
          recognition.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript, confidence }], { isFinal: true })] })
        }, { transcript, confidence })
      }
      const board = new Chess(data.fen)
      if (scenario === 'legal-wrong') {
        const wrong = board.moves({ verbose: true }).find(move => {
          if (move.from !== data.moves[0].slice(0, 2) || `${move.from}${move.to}${move.promotion ?? ''}` === data.moves[0]) return false
          const replay = new Chess(data.fen); replay.move(move)
          return !replay.isCheckmate()
        })
        assert.ok(wrong)
        await say(`${wrong.from}${wrong.to}${wrong.promotion ?? ''}`)
      }
      if (scenario === 'illegal-silent') {
        const from = data.moves[0].slice(0, 2)
        const illegal = Array.from({ length: 64 }, (_, i) => `${String.fromCharCode(97 + i % 8)}${1 + Math.floor(i / 8)}`)
          .find(to => to !== from && !board.moves({ verbose: true }).some(move => move.from === from && move.to === to))
        assert.ok(illegal)
        await say(`${board.get(from).type}${from}${illegal}`)
      }
      if (scenario === 'silent-button') await page.getByRole('button', { name: 'Silent error', exact: true }).click()
      if (scenario === 'silent-button' || scenario === 'illegal-silent') {
        const controls = page.locator('.trainer-puzzle-panel-controls')
        await controls.getByText('Wrong, silent error', { exact: true }).waitFor()
        assert.equal(await boardPieces(), initialPieces, 'Silent error never changes the board')
        assert.equal(await page.getByRole('button', { name: 'Silent error', exact: true }).isEnabled(), true, 'same button behavior: learner remains active without recovery lock')
        assert.equal(await page.getByRole('button', { name: 'Retry microphone', exact: true }).isEnabled(), true)
        if (scenario === 'illegal-silent') {
          await page.getByRole('status').filter({ hasText: 'Illegal move submitted' }).waitFor()
          assert.doesNotMatch(await page.getByRole('status').filter({ hasText: 'Illegal move submitted' }).textContent(), /No clear chess answer/)
        }
        // A fresh recognizer must replace the consumed illegal utterance even
        // though Silent error deliberately leaves the board/position unchanged.
        if (scenario === 'illegal-silent' && !useAiVoice) await page.waitForFunction(() => window.__voiceAnswerRecognition !== window.__submittedVoiceRecognition)
        await listening()
        const state = { pieces: await boardPieces(), counter: await page.getByText('0 / 5 fast solves', { exact: true }).textContent() }
        if (scenario === 'silent-button') silentParity.set(data.path, state)
        else assert.deepEqual(state, silentParity.get(data.path), 'illegal voice exactly matches Silent error button before continuing')
      }
      if (scenario.includes('wrong')) {
        const feedback = page.locator('.trainer-puzzle-panel-controls').getByText('Wrong move — try again.', { exact: true })
        await feedback.waitFor()
        await listening()
        // Legal wrong-move recovery retains the existing 140ms piece animation.
        await page.waitForFunction(expected => [...document.querySelectorAll('[role="group"][aria-label$="chessboard"] [data-square]')].flatMap(square => {
          const piece = square.querySelector('[data-piece]')?.getAttribute('data-piece')
          return piece ? [`${square.getAttribute('data-square')}:${piece}`] : []
        }).sort().join('|') === expected, initialPieces, { timeout: 1500 })
        assert.equal(await boardPieces(), initialPieces, 'retry restores/retains original board')
        const closeCoach = page.getByRole('button', { name: 'Close coach note', exact: true })
        if (await closeCoach.isVisible()) await closeCoach.click()
      }
      if (scenario === 'uncertain') {
        for (const phrase of ['background conversation', 'queen...']) {
          await say(phrase)
          await listening()
          assert.equal(await boardPieces(), initialPieces)
          assert.doesNotMatch((await page.locator('.trainer-puzzle-panel-controls [role="status"]').allTextContents()).join(' '), /Wrong/)
        }
      }
      for (const [i, move] of data.moves.entries()) {
        await listening()
        await say(move)
        if (i + 1 < data.moves.length) await page.getByText(`Find move ${i + 2} of ${data.moves.length}`, { exact: true }).waitFor()
      }
      await page.getByText('Correct', { exact: true }).waitFor()
      const count = scenario.includes('wrong') || scenario.includes('silent') ? 0 : 1
      assert.equal(await page.getByText(`${count} / 5 fast solves`, { exact: true }).isVisible(), true, `${data.path}/${scenario}: real trainer mastery result`)
      if(useAiVoice && scenario==='correct') {
        await page.getByText('Correct', {exact:true}).waitFor({state:'hidden',timeout:6000})
        await listening()
        assert.equal(await page.getByRole('button',{name:'Retry microphone',exact:true}).isEnabled(),true,'AI resumes automatically after the normal next-puzzle transition')
      }
      console.log(`PASS ${data.path} ${useAiVoice ? 'AI' : 'browser'} voice ${scenario}: existing trainer handler, board and /5 counter`)
    } finally { await context.close() }
  }
}

async function runAtomicTransitionMatrix(browser) {
  assert.ok(!liveBaseUrl, 'transition fixtures are local-only')
  const position = fen => new Chess(fen).board().flat().filter(Boolean).map(p => `${p.square}:${p.color}${p.type.toUpperCase()}`).sort().join('|')
  const cases = []
  for (const [path, chunkPath] of [
    ['/mates/m1/back-rank', '/data/full-curricula-v1/pattern-mates/back-rank/mate-in-1/chunk-001.json'],
    ['/tactics/m1/bishop-fork', '/data/full-curricula-v1/pattern-tactics/bishop-fork/m1/chunk-001.json'],
  ]) {
    const chunk = JSON.parse(await readFile(join(root, 'public', chunkPath), 'utf8'))
    const rows = Array.isArray(chunk) ? chunk : chunk.puzzles
    const ready = puzzle => {
      const board = new Chess(puzzle.fen)
      if (puzzle.preMove) board.move(puzzle.preMove)
      return board
    }
    const first = rows[0]
    const second = rows.find(p => p !== first && ready(p).turn() !== ready(first).turn())
    assert.ok(second?.preMove, `${path}: real opposite-orientation premove regression fixture`)
    for (const [current, next] of path.startsWith('/mates/') ? [[first, second], [second, first]] : [[first, second]]) {
      cases.push({ path, chunkPath, chunk: Array.isArray(chunk) ? [current, next] : { ...chunk, puzzles: [current, next] }, fen: ready(current).fen(), moves: current.solutionLine ?? [current.solution], nextFen: ready(next).fen(), nextMoves: next.solutionLine ?? [next.solution] })
    }
  }
  for (const [path, indexName, first] of [
    ['/master-mates/1/smothered', 'mates-theme-1-smothered.json', mateFixture],
    ['/master-tactics/2/bishop-fork', 'tactics-course-2-bishop-fork.json', tacticFixture],
  ]) {
    const index = await readJson(`indexes/${indexName}`)
    let second
    for (const ref of index.refs.slice(1)) {
      const shard = await readJson(`puzzles/chunk-${String(ref.chunk).padStart(5, '0')}.json`)
      const puzzle = shard.puzzles.find(p => p.id === ref.id)
      if (new Chess(puzzle.fen).turn() !== new Chess(first.puzzle.fen).turn()) { second = { ref, puzzle }; break }
    }
    assert.ok(second, `${path}: real opposite-orientation Master fixture`)
    singleRefIndexes.set(`indexes/${indexName}`, { ...index, refs: [first.ref, second.ref] })
    cases.push({ path, fen: first.puzzle.fen, moves: learnerMoves(first.puzzle), nextFen: second.puzzle.fen, nextMoves: learnerMoves(second.puzzle), firstMaster: first.puzzle.provenance.masterGame, nextMaster: second.puzzle.provenance.masterGame })
  }
  for (const fixtureData of cases) {
    if (fixtureData.chunkPath) regularChunks.set(fixtureData.chunkPath, fixtureData.chunk)
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const page = await preparePage(context)
    try {
      await waitTrainer(page, fixtureData.path)
      await page.evaluate(() => {
        window.__mountedPuzzleBoard = document.querySelector('.trainer-shell-custom-board-slot [data-boardid]')
      })
      // Two consecutive automatic transitions in the same mounted trainer,
      // including a color/orientation change and a wrap back to the first puzzle.
      for (let transition = 0; transition < 2; transition++) {
      const data = transition === 0 ? fixtureData : { ...fixtureData, fen: fixtureData.nextFen, moves: fixtureData.nextMoves, nextFen: fixtureData.fen, firstMaster: fixtureData.nextMaster, nextMaster: fixtureData.firstMaster }
      const nextCounter = transition === 0 ? 'Puzzle 2 / 2' : 'Puzzle 1 / 2'
      await page.getByText(/^Find (?:the (?:mate|tactic)|move)/).waitFor()
      const orientation = new Chess(data.fen).turn() === 'w' ? 'white' : 'black'
      // Record every animation frame, including DOM piece placement rather than
      // just React/FEN state, so the chessboard library cannot hide a flash.
      await page.evaluate(() => {
        window.__transitionFrames = []
        const sample = () => {
          const board = document.querySelector('.trainer-shell-custom-board-slot .accessible-chessboard')
          const description = board && document.getElementById(board.getAttribute('aria-describedby'))?.textContent
          const frame = {
            at: Date.now(),
            mounted: board?.querySelector('[data-boardid]') === window.__mountedPuzzleBoard,
            squareCount: board?.querySelectorAll('[data-square]').length ?? 0,
            visible: !!board && board.getBoundingClientRect().width > 0 && board.getBoundingClientRect().height > 0,
            incompleteImages: [...(board?.querySelectorAll('img') ?? [])].filter(img => !img.complete || !img.naturalWidth).length,
            incompleteImageUrls: [...(board?.querySelectorAll('img') ?? [])].filter(img => !img.complete || !img.naturalWidth).map(img => img.src),
            movingPieces: [...(board?.querySelectorAll('[data-piece]') ?? [])].filter(p => { const transform = getComputedStyle(p).transform; return transform !== 'none' && !new DOMMatrixReadOnly(transform).isIdentity }).length,
            pieces: [...(board?.querySelectorAll('[data-square]') ?? [])].flatMap(s => {
              const piece = s.querySelector('[data-piece]')?.getAttribute('data-piece')
              return piece ? [`${s.getAttribute('data-square')}:${piece}`] : []
            }).sort().join('|'),
            firstSquare: board?.querySelector('[data-square]')?.getAttribute('data-square'),
            successMarker: document.querySelector('.trainer-shell-custom-board-slot')?.textContent.includes('✓') ?? false,
            counter: document.querySelector('[aria-label^="Current puzzle"]')?.textContent,
            sideLabel: document.querySelector('.trainer-puzzle-panel-controls')?.textContent.match(/(?:White|Black) to Move/)?.[0],
            feedback: document.querySelector('.trainer-puzzle-panel-controls [role="status"]')?.textContent,
            feedbackMessage: document.querySelector('.trainer-puzzle-panel-controls [role="status"]')?.lastElementChild?.textContent,
            top: document.querySelector('.trainer-shell-board-top')?.textContent ?? '',
            bottom: document.querySelector('.trainer-shell-board-bottom')?.textContent ?? '',
            provenance: document.querySelector('.trainer-puzzle-panel-reference')?.textContent ?? '',
            description,
          }
          window.__transitionFrames.push(frame)
          window.__transitionFrameHandle = requestAnimationFrame(sample)
        }
        sample()
      })
      const slowTransition = process.argv.includes('--slow-transition')
      const successFeedback = slowTransition ? 'Correct, but slow' : 'Correct'
      for (const [i, move] of data.moves.entries()) {
        await setNow(page, (await page.evaluate(() => performance.now())) + (slowTransition && i === 0 ? 5_000 : 500))
        await clickSquare(page, move.slice(0,2), orientation)
        await clickSquare(page, move.slice(2,4), orientation)
        if (i + 1 < data.moves.length) await page.getByText(`Find move ${i+2} of ${data.moves.length}`, { exact:true }).waitFor()
      }
      await page.getByText(successFeedback, { exact:true }).waitFor()
      await page.getByText(nextCounter, { exact:true }).waitFor({ timeout:3000 })
      await page.waitForTimeout(180)
      const frames = await page.evaluate(() => { cancelAnimationFrame(window.__transitionFrameHandle); return window.__transitionFrames })
      const successIndex = frames.findIndex(f => f.feedbackMessage === successFeedback)
      assert.ok(successIndex >= 0, `${data.path}: exact Correct message captured in rendered frames`)
      const stableSolved = frames.slice(successIndex).find(f => f.at >= frames[successIndex].at + 200)
      const nextIndex = frames.findIndex(f => f.counter === nextCounter)
      assert.ok(successIndex >= 0 && stableSolved && nextIndex > successIndex)
      const sideLabel = fen => `${new Chess(fen).turn() === 'w' ? 'White' : 'Black'} to Move`
      for (const frame of frames.slice(successIndex)) {
        assert.equal(frame.sideLabel, sideLabel(frame.counter === nextCounter ? data.nextFen : data.fen), `${data.path}: learner-side label stays through completion and switches atomically`)
        assert.equal(frame.mounted, true, `${data.path}: board node never unmounts`)
        assert.equal(frame.squareCount, 64, `${data.path}: no blank/partial board`)
        assert.equal(frame.visible, true, `${data.path}: board has visible dimensions`)
      }
      const nextPieces = position(data.nextFen)
      const elapsed = frames[nextIndex].at - frames[successIndex].at
      assert.ok(elapsed >= 1950 && elapsed <= 2100, `${data.path}: transition ${elapsed}ms, no added setup delay`)
      for (const frame of frames.filter(f => f.at >= stableSolved.at)) {
        const next = frame.counter === nextCounter
        assert.equal(frame.incompleteImages, 0, `${data.path}: every settled/next piece image is ready at ${frame.at-frames[successIndex].at}ms ${frame.counter}: ${frame.incompleteImageUrls}`)
        assert.equal(frame.pieces, next ? nextPieces : stableSolved.pieces, `${data.path}: no intermediate position at ${frame.at-frames[successIndex].at}ms`)
        if (next) {
          assert.match(frame.feedback ?? '', /^Find/, `${data.path}: next puzzle instruction is immediately visible without a speed badge`)
          assert.equal(frame.firstSquare, new Chess(data.nextFen).turn() === 'w' ? 'a8' : 'h1', 'orientation changes with next board')
          assert.equal(frame.successMarker, false, 'previous correct-square marker is cleared with the next board')
          assert.equal(frame.movingPieces, 0, 'unrelated puzzle positions never morph')
        } else assert.equal(frame.feedbackMessage, successFeedback)
        const master = next ? data.nextMaster : data.firstMaster
        if (master) {
          const turn = new Chess(next ? data.nextFen : data.fen).turn()
          assert.ok(frame.top.includes(turn === 'w' ? master.black : master.white), 'top player synchronized')
          assert.ok(frame.bottom.includes(turn === 'w' ? master.white : master.black), 'bottom player synchronized')
          assert.ok(frame.provenance.includes(master.white) && frame.provenance.includes(master.black), 'provenance synchronized')
        }
      }
      assert.equal(await page.getByText(`${slowTransition ? 0 : transition} / 5 fast solves`, { exact:true }).isVisible(), true, 'next puzzle retains its own mastery')
      assert.match(await page.getByText(/% stage mastery/).locator('..').innerText(), /0 \/ 2 puzzles completed/)
      assert.equal(await page.locator('style[data-global-hint-highlights]').count(), 0, 'no stale hint highlights')
      console.log(`PASS ${data.path} transition ${transition + 1} (${sideLabel(data.fen)}): ${frames.length} rendered frames; completed board -> next board at ${elapsed}ms; board remains mounted, side label, counter, orientation, players and provenance synchronized`)
      }
    } finally { await context.close() }
  }
}
try {
  if (!liveBaseUrl) {
    await waitForServer()
    proxy = createProxy()
    await new Promise((done, reject) => { proxy.once('error', reject); proxy.listen(proxyPort, host, done) })
  }
  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() })

  if (process.argv.includes('--transition-only')) await runAtomicTransitionMatrix(browser)
  else if (process.argv.includes('--voice-only') || aiVoiceTest) await runVoiceAnswerMatrix(browser)
  else {
    await runIntentMatrix(browser)
    if (!liveBaseUrl) await runVoiceAnswerMatrix(browser)
  }

  if (!process.argv.includes('--intent-only') && !process.argv.includes('--transition-only') && !process.argv.includes('--voice-only') && !aiVoiceTest) {

  // Perfect click-to-move: actual counter N -> N+1.
  await runTacticScenario(browser, async (page) => solveTactic(page), 1)

  // Silent wrong source, then a correct solve: counter remains N.
  await runTacticScenario(browser, async (page) => {
    await setNow(page, 500)
    await clickSquare(page, 'c4')
    await clickSquare(page, 'c4')
    await solveTactic(page)
  }, 0)

  // Silent wrong destination, then correct: counter remains N.
  await runTacticScenario(browser, async (page) => {
    await setNow(page, 500)
    await clickSquare(page, 'c3')
    await clickSquare(page, 'c2')
    await solveTactic(page)
  }, 0)

  // Hint then correct: counter remains N.
  await runTacticScenario(browser, async (page) => {
    await page.getByRole('button', { name: 'Hint', exact: true }).click()
    await solveTactic(page)
  }, 0)

  // Correct source at 5 seconds: explicit slow feedback; counter remains N.
  await runTacticScenario(browser, async (page) => solveTactic(page, { firstSourceAt: 5_000, feedback: 'Correct, but slow' }), 0)
  // Timely first move, slow later learner move: same feedback and unchanged credit.
  await runTacticScenario(browser, async (page) => solveTactic(page, { firstSourceAt: 1_900, laterMoveDelay: 5_000, feedback: 'Correct, but slow' }), 0)

  // Untimed mastery ignores recognition time and credits the same actual counter.
  await runTacticScenario(
    browser,
    async (page) => solveTactic(page, { firstSourceAt: 2_001 }),
    1,
    { width: 1920, height: 1080 },
    false,
  )

  // Untimed mastery still rejects a silent wrong source.
  await runTacticScenario(browser, async (page) => {
    await setNow(page, 500)
    await clickSquare(page, 'c4')
    await clickSquare(page, 'c4')
    await solveTactic(page, { firstSourceAt: 5_000 })
  }, 0, { width: 1920, height: 1080 }, false)

  // Untimed mastery still rejects a hint.
  await runTacticScenario(browser, async (page) => {
    await page.getByRole('button', { name: 'Hint', exact: true }).click()
    await solveTactic(page, { firstSourceAt: 5_000 })
  }, 0, { width: 1920, height: 1080 }, false)

  // AccessibleMoveInput uses the same untimed mastery pipeline.
  await runTacticScenario(browser, async (page) => {
    await page.getByText('Keyboard move controls', { exact: true }).focus()
    await page.keyboard.press('Enter')
    await setNow(page, 5_000)
    await page.getByLabel('From square').focus()
    await page.keyboard.type('c3')
    await page.keyboard.press('Enter')
    await page.keyboard.type('f6')
    await page.keyboard.press('Enter')
    await page.getByText('Find move 2 of 2', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText('Keyboard move controls', { exact: true }).focus()
    await page.keyboard.press('Enter')
    await setNow(page, 20_000)
    await page.getByLabel('From square').focus()
    await page.keyboard.type('f6')
    await page.keyboard.press('Enter')
    await page.keyboard.type('h4')
    await page.keyboard.press('Enter')
    await page.getByText('Correct', { exact: true }).waitFor({ state: 'visible' })
  }, 1, { width: 1366, height: 768 }, false)

  // Timely source intent does not excuse a move completed after the strict 3s limit.
  await runTacticScenario(browser, async (page) => solveTactic(page, {
    firstSourceAt: 1_000,
    firstDropAt: 5_000,
    drag: true,
    feedback: 'Correct, but slow',
  }), 0)

  // Five actual qualifying solves still reach the unchanged 5/5 mastery threshold.
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
    const page = await preparePage(context)
    for (let count = 0; count < 5; count += 1) {
      await waitTrainer(page, '/master-tactics/2/bishop-fork', count)
      await solveTactic(page)
      await page.getByText(new RegExp(`${count + 1} \\/ 5 fast solves`)).waitFor({ state: 'visible' })
      await page.waitForTimeout(50)
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true)
    await context.close()
  }

  // Five actual untimed qualifying solves still reach the same 5/5 threshold.
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
    const page = await preparePage(context, { timedMasteryEnabled: false })
    for (let count = 0; count < 5; count += 1) {
      await waitTrainer(page, '/master-tactics/2/bishop-fork', count)
      await solveTactic(page, { firstSourceAt: 5_000 })
      await page.getByText(new RegExp(`${count + 1} \/ 5 fast solves`)).waitFor({ state: 'visible' })
      await page.waitForTimeout(50)
    }
    await context.close()
  }

  // Master Mates uses the same qualification and counter pipeline on touch/mobile.
  for (const wrongTouchSource of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    const page = await preparePage(context, { timedMasteryEnabled: wrongTouchSource ? false : undefined })
    await waitTrainer(page, '/master-mates/1/smothered')
    const [move] = learnerMoves(mateFixture.puzzle)
    const orientation = mateFixture.puzzle.learnerSide === 'b' ? 'black' : 'white'
    if (wrongTouchSource) {
      const board = new Chess(mateFixture.puzzle.fen)
      const expectedSource = move.slice(0, 2)
      const wrongPiece = board.board().flat().find((piece) => piece && piece.color === board.turn() && piece.square !== expectedSource)
      assert.ok(wrongPiece, 'mate fixture has a second learner piece for wrong-source touch test')
      await setNow(page, 500)
      await clickSquare(page, wrongPiece.square, orientation, true)
      await clickSquare(page, wrongPiece.square, orientation, true)
    }
    await setNow(page, wrongTouchSource ? 5_000 : 1_000)
    await clickSquare(page, move.slice(0, 2), orientation, true)
    await clickSquare(page, move.slice(2, 4), orientation, true)
    await page.getByText('Correct', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByText(new RegExp(`${wrongTouchSource ? 0 : 1} \\/ 5 fast solves`)).waitFor({ state: 'visible' })
    const boardBox = await page.locator('.trainer-shell-board-frame').boundingBox()
    assert.ok(boardBox && boardBox.x >= 0 && boardBox.x + boardBox.width <= 391)
    await context.close()
  }

  // Account Settings exposes one responsive, keyboard-operable, persistent switch.
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport })
    const page = await preparePage(context)
    await page.goto(`${baseUrl}/account`, { waitUntil: 'commit' })
    const toggle = page.getByRole('switch', { name: 'Timed mastery' })
    await toggle.waitFor({ state: 'visible', timeout: 30_000 })
    assert.equal(await toggle.isChecked(), true, 'fresh storage defaults timed mastery ON')
    await toggle.focus()
    await page.keyboard.press('Space')
    assert.equal(await toggle.isChecked(), false, 'keyboard changes timed mastery to OFF')
    await page.reload()
    const reloadedToggle = page.getByRole('switch', { name: 'Timed mastery' })
    assert.equal(await reloadedToggle.isChecked(), false, 'OFF persists across reload')
    await reloadedToggle.click()
    await page.reload()
    assert.equal(await page.getByRole('switch', { name: 'Timed mastery' }).isChecked(), true, 'ON persists across reload')
    const card = await page.locator('.timed-mastery-setting').boundingBox()
    assert.ok(card && card.x >= 0 && card.x + card.width <= viewport.width + 1, `setting fits ${viewport.width}px viewport`)
    await context.close()
  }

  }
  assert.deepEqual(errors, [])
  console.log('Rendered perfection/mastery integration: PASS')
  if (!process.argv.includes('--intent-only') && !process.argv.includes('--transition-only') && !process.argv.includes('--voice-only') && !aiVoiceTest) {
  console.log('Actual counters: timed first/later 5000ms N with Correct, but slow; untimed remains Correct with N+1; wrong source/hint remain N; timed and untimed thresholds 5/5')
  console.log('Responsive setting and interaction: 1920x1080, 1366x768, 390x844; click/drag/touch/keyboard PASS')
  }
} finally {
  if (browser) await browser.close().catch(() => {})
  if (proxy) await new Promise((done) => proxy.close(done))
  vite?.kill()
}
