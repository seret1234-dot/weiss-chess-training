import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithEsbuild } from 'vite'

const moduleUrl = new URL('../src/masterGames/libraryData.ts', import.meta.url)
const source = await readFile(moduleUrl, 'utf8')
const transformed = await transformWithEsbuild(source, moduleUrl.pathname, {
  loader: 'ts',
  format: 'esm',
  target: 'es2022',
})
const library = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`)

class Query {
  constructor(client, table) {
    this.client = client
    this.table = table
    this.calls = []
  }
  select(...args) { this.calls.push(['select', ...args]); return this }
  eq(...args) { this.calls.push(['eq', ...args]); return this }
  order(...args) { this.calls.push(['order', ...args]); return this }
  range(...args) { this.calls.push(['range', ...args]); return this }
  limit(...args) { this.calls.push(['limit', ...args]); return this }
  maybeSingle() { this.calls.push(['maybeSingle']); return this }
  upsert(...args) { this.calls.push(['upsert', ...args]); return this }
  delete() { this.calls.push(['delete']); return this }
  then(resolve, reject) {
    this.client.queries.push({ table: this.table, calls: this.calls })
    return Promise.resolve(this.client.responses.shift() ?? { data: [], count: 0, error: null }).then(resolve, reject)
  }
}

class FakeClient {
  constructor(responses = []) {
    this.responses = [...responses]
    this.queries = []
    this.rpcCalls = []
  }
  from(table) { return new Query(this, table) }
  async rpc(name, args) {
    this.rpcCalls.push({ name, args })
    return this.responses.shift() ?? { data: [], error: null }
  }
}

const countClient = new FakeClient([{ count: 17, error: null }])
assert.equal(await library.getSavedMasterGameCount(countClient, 'user-a'), 17)
assert.ok(countClient.queries[0].calls.some((call) => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-a'))
assert.deepEqual(countClient.queries[0].calls.at(-1), ['limit', 1])

const idsClient = new FakeClient([{ data: [{ game_id: '9' }, { game_id: 7 }], count: 56, error: null }])
assert.deepEqual(await library.getSavedMasterGameIds(idsClient, 'user-a', 2, 30), { gameIds: [9, 7], total: 56 })
assert.deepEqual(idsClient.queries[0].calls.at(-1), ['range', 30, 59])

const savedClient = new FakeClient([{ data: { game_id: 12 }, error: null }])
assert.equal(await library.isMasterGameSaved(savedClient, 'user-a', 12), true)

const addClient = new FakeClient([{ error: null }, { error: null }])
await library.addMasterGameToLibrary(addClient, 'user-a', 12)
await library.addMasterGameToLibrary(addClient, 'user-a', 12)
for (const query of addClient.queries) {
  const call = query.calls.find(([method]) => method === 'upsert')
  assert.deepEqual(call[1], { user_id: 'user-a', game_id: 12, source: 'manual', is_favorite: true })
  assert.deepEqual(call[2], { onConflict: 'user_id,game_id', ignoreDuplicates: true })
}

const removeClient = new FakeClient([{ error: null }, { error: null }])
await library.removeMasterGameFromLibrary(removeClient, 'user-a', 12)
await library.removeMasterGameFromLibrary(removeClient, 'user-a', 12)
assert.ok(removeClient.queries.every((query) => query.calls.some((call) => call[0] === 'delete')))
assert.ok(removeClient.queries.every((query) => query.calls.some((call) => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-a')))

const pageClient = new FakeClient([{
  data: [{
    game_id: 12,
    added_at: '2026-09-05T12:00:00Z',
    master_game: { id: 12, slug: 'game-12', white: 'White', black: 'Black', year: 2026 },
  }],
  count: 56,
  error: null,
}])
const page = await library.fetchSavedMasterGamesPage(pageClient, 'user-a', 1, 30)
assert.equal(page.total, 56)
assert.equal(page.games[0].addedAt, '2026-09-05T12:00:00Z')
assert.deepEqual(pageClient.queries[0].calls.filter(([method]) => method === 'order'), [
  ['order', 'added_at', { ascending: false }],
  ['order', 'game_id', { ascending: false }],
])
assert.deepEqual(pageClient.queries[0].calls.at(-1), ['range', 0, 29])

const nextClient = new FakeClient([{ data: [{ id: 13, slug: 'game-13' }], error: null }])
assert.deepEqual(await library.getNextSavedMasterGame(nextClient, 12), { id: 13, slug: 'game-13' })
assert.deepEqual(nextClient.rpcCalls, [{ name: 'next_user_master_game', args: { p_current_game_id: 12 } }])
assert.equal(library.masterGameLibraryRoute({ id: 13, slug: 'game 13' }), '/master-games/game%2013')

await assert.rejects(() => library.addMasterGameToLibrary(addClient, '', 12), /Sign in/)
await assert.rejects(() => library.addMasterGameToLibrary(addClient, 'user-a', 0), /Invalid Master Game ID/)

const [migration, router, gamePage, libraryPage, practicePage, searchPage] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260905184451_secure_user_master_games_library.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/AppRouter.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/MasterGamesPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/masterGames/MyMasterGamesLibraryPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/masterGames/MasterGamesLibraryPracticePage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/MasterGamesLibraryPage.tsx', import.meta.url), 'utf8'),
])

assert.match(migration, /primary key \(user_id, game_id\)/i)
assert.match(migration, /references auth\.users\(id\) on delete cascade/i)
assert.match(migration, /references public\.master_games\(id\) on delete cascade/i)
assert.match(migration, /enable row level security/i)
assert.equal((migration.match(/create policy [\s\S]*?to authenticated/g) ?? []).length, 4)
assert.ok((migration.match(/\(select auth\.uid\(\)\)/g) ?? []).length >= 7)
assert.match(migration, /revoke all on table public\.user_master_games from anon, authenticated/i)
assert.match(migration, /grant select, insert, update, delete on table public\.user_master_games to authenticated/i)
assert.match(migration, /security invoker/i)
assert.doesNotMatch(migration, /security definer/i)
assert.match(migration, /order by saved\.added_at desc, saved\.game_id desc/i)

assert.match(router, /path="\/master-games\/my-library"/)
assert.match(router, /path="\/master-games\/my-library\/practice"/)
assert.ok(router.indexOf('path="/master-games/my-library"') < router.indexOf('path="/master-games/:gameId"'))
assert.match(gamePage, /\+ Add to My Library/)
assert.match(gamePage, /Remove from My Library/)
assert.match(gamePage, /rememberTrainingReturnTarget\(target\)/)
assert.match(libraryPage, /MASTER_GAME_LIBRARY_PAGE_SIZE/)
assert.match(libraryPage, /No games saved yet/)
assert.match(libraryPage, /Practice My Library/)
assert.match(practicePage, /getNextSavedMasterGame/)
assert.match(searchPage, /My Library \(\$\{savedGamesCount\.toLocaleString\(\)\}\)/)

for (const candidate of [source, gamePage, libraryPage, practicePage]) {
  assert.doesNotMatch(candidate, /\.from\(['"]training_progress['"]\)\s*\.delete/s, 'bookmark code never deletes Master Games progress')
  assert.doesNotMatch(candidate, /localStorage.*(?:library|bookmark)/i, 'Supabase remains authoritative for bookmarks')
}

console.log('PASS: My Library data APIs are owner-scoped, paginated, newest-first, idempotent, route-safe, and remove bookmarks without deleting progress')
