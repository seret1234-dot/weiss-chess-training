import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import ts from 'typescript'
import { Chess } from 'chess.js'

async function moduleAt(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  return module.exports
}
const { accountStorageKey, readOwnedJson, writeOwnedJson } = await moduleAt('src/auth/accountBrowserStorage.ts')
const entries = new Map()
const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) }
globalThis.window = { localStorage: storage, sessionStorage: storage }
globalThis.sessionStorage = storage
const key = 'weiss-weekly-adaptive-test-v1'
const A = 'account-a', B = 'account-b'
const board = new Chess(); board.move('d4')
const game = { color: 'white', started: true, completed: false, pgn: board.pgn(), fen: board.fen(), result: '*', updatedAt: '2026-09-13T00:00:00Z' }
const stateA = { userId: A, weekKey: '2026-09-07', currentGame: 0, games: [game, { ...game, color: 'black', started: false, pgn: '', fen: new Chess().fen() }] }
storage.setItem(key, JSON.stringify(stateA))

// Reproduce the deployed loader against a foreign account's cache. No backend.
function loader(source) {
  // Keep this source-level regression focused on the cache constructors/loaders.
  // The terminal-result helper is now imported, so the old getGameResult marker
  // no longer exists and would accidentally include the page's JSX.
  const body = source.slice(source.indexOf('const WEEKLY_TEST_STORAGE_KEY'), source.indexOf('function saveWeeklyTestState('))
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function('Chess', 'getRecentTransferTargets', 'readOwnedJson', 'writeOwnedJson', `${js}; return loadWeeklyTestState`)(Chess, () => [], readOwnedJson, writeOwnedJson)
}
// Optional production-source reproduction; the regression itself is portable.
if (process.env.ACCOUNT_ISOLATION_BASELINE_PLAY_SOURCE) {
  const oldSource = await readFile(process.env.ACCOUNT_ISOLATION_BASELINE_PLAY_SOURCE, 'utf8')
  const leaked = loader(oldSource)(stateA.weekKey, 1500, B)
  assert.equal(leaked.userId, A)
  assert.equal(leaked.games[0].fen, game.fen)
  assert.equal(({ ...leaked, userId: B }).games[0].pgn, game.pgn, 'old hydration could relabel A progress as B')
  console.log('REPRODUCED deployed unscoped Weekly cache leakage (isolated data only)')
}

const current = loader(await readFile('src/pages/PlayComputerPage.tsx', 'utf8'))
assert.equal(current(stateA.weekKey, 1500, B).games[0].started, false)
assert.equal(current(stateA.weekKey, 1500, B).games[0].pgn, '')
assert.equal(current(stateA.weekKey, 1500, A).games[0].pgn, game.pgn)
assert.deepEqual(readOwnedJson(storage, key, A), stateA)
assert.equal(readOwnedJson(storage, key, B), null)
assert.equal(readOwnedJson(storage, key, null), null)
writeOwnedJson(storage, key, stateA)
writeOwnedJson(storage, key, { ...stateA, userId: B, currentGame: 1 })
assert.equal(readOwnedJson(storage, key, A).currentGame, 0)
assert.equal(readOwnedJson(storage, key, B).currentGame, 1)
assert.equal(storage.getItem(key), JSON.stringify(stateA), 'legacy source retained untouched')
entries.delete(accountStorageKey(key, B)); storage.setItem(key, JSON.stringify({ ...stateA, userId: undefined }))
assert.equal(readOwnedJson(storage, key, B), null, 'unknown owner cannot be adopted')
const broken = { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } }
assert.equal(readOwnedJson(broken, key, A), null)
assert.doesNotThrow(() => writeOwnedJson(broken, key, stateA))

const { saveNormalPlaySession: save, readNormalPlaySession: read } = await moduleAt('src/utils/playComputerSession.ts')
const value = { entryFen: new Chess().fen(), fen: board.fen(), pgn: board.pgn(), playerColor: 'white', orientation: 'white', engineElo: 1500, started: true, status: 'White to move' }
save(value, A)
assert.deepEqual(read(undefined, A), value)
assert.equal(read(undefined, B), null)
assert.equal(read(), null)
save({ ...value, engineElo: 1200 }, B)
assert.equal(read(undefined, A).engineElo, 1500)
assert.equal(read(undefined, B).engineElo, 1200)

const { rememberTrainingReturnTarget: remember, resolveTrainingReturnTarget: resolve, authRouterState } = await import('../src/auth/trainingReturnTarget.mjs')
const record = remember('/mates/m1/back-rank?auto=1', { storage, userId: A })
assert.equal(resolve({ storage, routerState: authRouterState(record), userId: B }), null)
assert.equal(resolve({ storage, routerState: authRouterState(record), userId: A }), record.target)
assert.equal(resolve({ storage, routerState: authRouterState({ ...record, userId: undefined }), userId: B }), null)
console.log('PASS account-owned Weekly/Play/return caches: A -> B -> A, unknown owner denied, legacy owner recovery, no cross-owner overwrite')
